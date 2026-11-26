import { issuanceFailureMessage, signingErrors } from './report-signing'

export const API_URL = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')
export const SECURE_API_ENABLED = import.meta.env.VITE_SECURE_API_ENABLED === 'true' && Boolean(API_URL)

let accessToken: string | null = null
export const setAccessToken = (token: string | null) => { accessToken = token }
export const notAvailable = (): never => { throw new Error('Integração em desenvolvimento. Nenhum dado foi enviado ou salvo.') }

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function readResponse<T>(
  path: string,
  init: RequestInit,
  decode: (response: Response) => Promise<T>,
  {authenticated = true, timeoutMs = 15000} = {},
): Promise<T> {
  if (!SECURE_API_ENABLED) return notAvailable()
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (init.signal?.aborted) abort()
  else init.signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, timeoutMs)
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const tokenAtRequest = authenticated ? accessToken : null
  if (tokenAtRequest) headers.set('Authorization', 'Bearer ' + tokenAtRequest)
  try {
    const response = await fetch(API_URL + path, {
      ...init, headers, signal: controller.signal, credentials: authenticated ? 'include' : 'omit', redirect: 'error',
    })
    if (!response.ok) {
      if (authenticated && response.status === 401 && accessToken === tokenAtRequest && path !== '/sessions') {
        setAccessToken(null)
        window.dispatchEvent(new Event('iakilab:unauthorized'))
      }
      const issuance = path.endsWith('/issue') || path.includes('/issue?')
      const draftImport = path.startsWith('/reports/drafts/import-pdf')
      const a1Configuration = path.startsWith('/reports/a1/configuration')
      const sampleWorkflow = /^\/samples\/[^/]+\/(inspection|analysis\/(start|result))(?:\?|$)/.test(path)
      const rectification = /^\/reports\/[^/]+\/(rectifications|rectification-pdf)(?:\?|$)/.test(path)
      const detail = issuance || draftImport || a1Configuration || sampleWorkflow || rectification ? await response.json().catch(() => null) : null
      const known = typeof detail?.code === 'string' && Object.hasOwn(signingErrors, detail.code)
      const duplicateImport = draftImport && response.status === 409 && detail?.code === 'DUPLICATE_RECORD'
      const workflowMessage = sampleWorkflow ? ({
        SAMPLE_ALREADY_INSPECTED: 'A inspeção já foi registrada. Confira o histórico da amostra.',
        SAMPLE_REJECTED: 'A amostra foi rejeitada e está disponível para avaliação de recoleta.',
        SAMPLE_INSPECTION_REQUIRED: 'Registre a inspeção antes de iniciar a análise.',
        SAMPLE_ANALYSIS_STATE_CONFLICT: 'A etapa de análise mudou. Confira a situação da amostra.',
      } as Record<string,string>)[detail?.code] : undefined
      const rectificationMessage = rectification || issuance ? ({
        RECTIFICATION_DISABLED: 'A retificação está desativada neste ambiente.',
        RECTIFICATION_ALREADY_EXISTS: 'Já existe uma versão posterior. Abra o histórico do laudo para continuar.',
        RECTIFICATION_REQUIRES_ISSUED_REPORT: 'A retificação só pode partir de um laudo emitido.',
        ALREADY_SIGNED_ORIGINAL: 'Envie o PDF corrigido exportado sem assinatura digital.',
        INVALID_PDF: 'Não foi possível ler o PDF corrigido.',
      } as Record<string,string>)[detail?.code] : undefined
      const stalePdfUpload = rectification && detail?.code === 'REPORT_REVISION_OR_STAGE_CONFLICT'
      const message = (stalePdfUpload ? 'A versão do rascunho mudou. Recarregue o laudo antes de anexar o PDF.' : rectificationMessage) ?? workflowMessage ?? (duplicateImport
        ? 'Já existe um laudo com esse número neste laboratório. Abra o laudo existente na lista ou informe outro número se este for um novo laudo.'
        : known ? issuance ? issuanceFailureMessage(detail.code) : signingErrors[detail.code] : undefined) ?? {
        401: path === '/sessions' ? 'E-mail ou senha inválidos.' : 'Sessão expirada. Entre novamente.',
        403: 'Acesso não autorizado.',
        404: 'Registro não encontrado.',
        409: 'O documento ainda não está disponível.',
      }[response.status] ?? `Não foi possível concluir a consulta (HTTP ${response.status}).`
      throw new ApiError(message, response.status)
    }
    return await decode(response)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new Error('Não foi possível conectar à API. Verifique a conexão e tente novamente.')
  } finally {
    clearTimeout(timeout)
    init.signal?.removeEventListener('abort', abort)
  }
}

export function request<T>(path: string, init: RequestInit = {}, options?: {authenticated?:boolean;timeoutMs?:number}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  return readResponse(path, { ...init, headers }, async response => (
    response.status === 204 ? undefined as T : await response.json() as T
  ), options)
}

export function authorizedPdfUrl(value?: string): string | null {
  if (!value || !SECURE_API_ENABLED) return null
  try {
    const base = new URL(API_URL + '/')
    const pdf = new URL(value, base)
    if (pdf.origin !== base.origin || !['https:', 'http:'].includes(pdf.protocol) || pdf.username || pdf.password) return null
    const prefix = base.pathname + 'pdf/'
    if (!pdf.pathname.startsWith(prefix) || !/^[a-f0-9-]{36}$/i.test(pdf.pathname.slice(prefix.length))) return null
    return pdf.href
  } catch {
    return null
  }
}

export async function requestPdf(value: string): Promise<Blob> {
  const authorized = authorizedPdfUrl(value)
  if (!authorized || !accessToken) throw new ApiError('PDF indisponível nesta sessão.', 403)
  const path = authorized.slice(API_URL.length)
  return readResponse(path, { headers: { Accept: 'application/pdf' } }, decodePdf)
}

export function requestReportPreview(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Blob> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/pdf')
  return readResponse(path, { ...init, headers, signal }, decodePdf, { timeoutMs: 30_000 })
}

async function decodePdf(response: Response) {
  if (response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/pdf') {
    throw new ApiError('A API não retornou um PDF válido.', 502)
  }
  return response.blob()
}
