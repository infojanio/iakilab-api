import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Heading, Notice, Panel, usePaths } from '../components/common'
import { useAuth } from '../context/AuthContext'
import { reportsService } from '../services/reports'
import { describeSigner, type SignerStatus } from '../services/report-signing'

export default function CertificateA1() {
  const { demo, base } = usePaths()
  const { user } = useAuth()
  const laboratoryId = user?.laboratoryId || ''
  const allowed = !demo && user?.role === 'ADMIN'
  const [status, setStatus] = useState<SignerStatus>()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!allowed) return
    let active = true
    reportsService
      .signerStatus(laboratoryId)
      .then((value) => {
        if (active) setStatus(value)
      })
      .catch(() => {
        if (active) setError('Não foi possível consultar o certificado.')
      })
    return () => {
      active = false
    }
  }, [allowed, laboratoryId])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !status?.manageable) return
    const form = event.currentTarget
    const data = new FormData(form)
    const intermediate = data.get('intermediateChain')
    if (intermediate instanceof File && !intermediate.size)
      data.delete('intermediateChain')
    setPending(true)
    setError('')
    setMessage('')
    try {
      setStatus(await reportsService.configureSigner(laboratoryId, data))
      form.reset()
      setMessage('Certificado conferido e ativado para novas emissões.')
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Não foi possível configurar o A1.',
      )
      const password = form.elements.namedItem('password')
      if (password instanceof HTMLInputElement) password.value = ''
    } finally {
      setPending(false)
    }
  }

  if (!allowed) return <Navigate to={base || '/app'} replace />
  return (
    <>
      <Heading
        title="Certificado A1"
        description="Configure o certificado usado para emitir os laudos deste laboratório."
      />
      <Panel title="Situação do certificado">
        {status && <p>{describeSigner(status)}</p>}
        {status && 'validFrom' in status && (
          <p>
            Validade de {new Date(status.validFrom).toLocaleString('pt-BR')} a{' '}
            {new Date(status.validUntil).toLocaleString('pt-BR')}.
          </p>
        )}
        {!status && !error && <p role="status">Consultando certificado…</p>}
      </Panel>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {status && !status.manageable && (
        <Notice>O cadastro pelo painel precisa ser habilitado na API.</Notice>
      )}
      {status?.manageable && (
        <Panel title="Cadastrar ou substituir certificado">
          <form onSubmit={save} className="report-form">
            <fieldset disabled={pending} className="form-grid">
              <label className="field">
                Certificado A1 (.pfx ou .p12)
                <input
                  name="certificate"
                  type="file"
                  accept=".pfx,.p12"
                  required
                />
              </label>
              <label className="field">
                Senha do certificado
                <input
                  name="password"
                  type="password"
                  autoComplete="off"
                  maxLength={1024}
                  required
                />
              </label>
              <label className="field">
                Raiz de confiança (.pem / .der / .crt)
                <input
                  name="trustRoot"
                  type="file"
                  accept=".pem,.der,.cer,.crt"
                  required
                />
              </label>
              <label className="field">
                Certificados intermediários (.pem), se necessário
                <input name="intermediateChain" type="file" accept=".pem" />
              </label>
              <button type="submit" className="button primary">
                {pending ? 'Conferindo o A1…' : 'Validar e ativar certificado'}
              </button>
            </fieldset>
          </form>
        </Panel>
      )}
    </>
  )
}
