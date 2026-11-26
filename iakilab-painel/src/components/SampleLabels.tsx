import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { Modal } from './common'
import { ApiError } from '../services/api'
import { samplesService, type SampleLabel } from '../services/resources'
import './sample-labels.css'

export function SampleLabels({ ids, laboratoryId, onClose }: {
 ids: string[]
 laboratoryId?: string
 onClose: () => void
}) {
 const [labels, setLabels] = useState<SampleLabel[]>()
 const [error, setError] = useState('')
 useEffect(() => {
  let active = true
  samplesService.labels(ids, laboratoryId)
   .then(labels => { if (active) setLabels(labels) })
   .catch(error => {
    if (!active) return
    setError(error instanceof ApiError && error.status === 404
     ? 'Uma ou mais amostras da seleção estão indisponíveis. Atualize a lista e selecione novamente.'
     : 'Não foi possível preparar as etiquetas. Feche a janela e tente novamente.')
   })
  return () => { active = false }
 }, [ids, laboratoryId])

 return <Modal title={ids.length === 1 ? 'Etiqueta da amostra' : 'Etiquetas das amostras'} onClose={onClose}>
  {error && <p role="alert" className="error">{error}</p>}
  {!labels && !error && <p role="status">Carregando etiquetas…</p>}
  {labels && <>
   <div className="sample-label-grid">
    {labels.map(label => <article className="sample-label" key={label.id}>
     <strong>{label.identification}</strong>
     {label.serviceOrderNumber && <p>OS: {label.serviceOrderNumber}</p>}
     {label.origin.trim() && <p>Origem: {label.origin}</p>}
    </article>)}
   </div>
   <div className="modal-actions">
    <button className="button primary" onClick={() => window.print()}>
     <Printer size={16}/>{ids.length === 1 ? 'Imprimir etiqueta' : 'Imprimir etiquetas'}
    </button>
   </div>
  </>}
 </Modal>
}
