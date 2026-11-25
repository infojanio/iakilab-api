import { useEffect, useState } from 'react'
import { reportsService } from '../services/reports'
import type { StructuredReportDraftDTO } from '../types/report-draft'

type PreviewSource =
  | { draft: StructuredReportDraftDTO; reportId?: never }
  | { reportId: string; draft?: never }

export function StructuredPdfPreview({ draft, reportId, laboratoryId }: PreviewSource & { laboratoryId: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | undefined
    setUrl('')
    setError('')
    const response = draft
      ? reportsService.previewDraft(draft, laboratoryId, controller.signal)
      : reportsService.previewSaved(reportId!, laboratoryId, controller.signal)
    response.then(pdf => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(pdf)
      setUrl(objectUrl)
    }).catch(error => {
      if (controller.signal.aborted) return
      setError(error instanceof Error ? error.message : 'Não foi possível gerar a prévia.')
    })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [draft, reportId, laboratoryId])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!url) return <p role="status">Gerando prévia do PDF…</p>
  return <div className="local-pdf-view">
    <iframe title="PDF do laudo para conferência" src={url}/>
    <a className="button" href={url} target="_blank" rel="noreferrer">Abrir ou imprimir prévia</a>
  </div>
}
