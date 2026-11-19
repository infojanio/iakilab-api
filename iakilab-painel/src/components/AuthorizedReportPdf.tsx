import { useEffect, useState } from 'react'
import { Download, Eye, FileText, LockKeyhole } from 'lucide-react'
import { requestPdf } from '../services/api'

export function AuthorizedReportPdf({ url, reportName, demo }: {
  url: string | null
  reportName: string
  demo: boolean
}) {
  const [pdf, setPdf] = useState<Blob | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pdf) return
    const link = URL.createObjectURL(pdf)
    setObjectUrl(link)
    return () => URL.revokeObjectURL(link)
  }, [pdf])

  async function loadPdf() {
    if (!url || loading) return
    setLoading(true)
    setError('')
    try {
      setPdf(await requestPdf(url))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível abrir o PDF.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="document-placeholder">
    <FileText size={32} />
    <h3>{demo ? 'Prévia de documento' : 'Documento do laudo'}</h3>
    <p>{demo ? 'O laudo demonstrativo não possui PDF ou assinatura real.' : 'O acesso depende de autorização do servidor.'}</p>
    {error && <div className="error" role="alert">{error}</div>}
    {objectUrl ? <>
      <iframe title="PDF do laudo autorizado" src={objectUrl} />
      <a className="button" href={objectUrl} download={`${reportName.replace(/[^\w.-]/g, '_')}.pdf`}>
        <Download size={16} />Download autorizado
      </a>
    </> : url ? <button className="button" disabled={loading} onClick={() => void loadPdf()}>
      <Eye size={16} />{loading ? 'Carregando PDF…' : 'Visualizar PDF'}
    </button> : <button className="button" disabled><LockKeyhole size={15} />PDF indisponível</button>}
  </div>
}
