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
): Promise<T> {
  if (!SECURE_API_ENABLED) return notAvailable()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const tokenAtRequest = accessToken
  if (tokenAtRequest) headers.set('Authorization', 'Bearer ' + tokenAtRequest)
  try {
    const response = await fetch(API_URL + path, {
      ...init, headers, signal: controller.signal, credentials: 'include', redirect: 'error',
    })
    if (!response.ok) {
      if (response.status === 401 && accessToken === tokenAtRequest && path !== '/sessions') {
        setAccessToken(null)
        window.dispatchEvent(new Event('iakilab:unauthorized'))
      }
      const message = {
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
  }
}

export function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  return readResponse(path, { ...init, headers }, async response => (
    response.status === 204 ? undefined as T : await response.json() as T
  ))
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
  return readResponse(path, { headers: { Accept: 'application/pdf' } }, async response => {
    if (response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/pdf') {
      throw new ApiError('A API não retornou um PDF válido.', 502)
    }
    return response.blob()
  })
}
