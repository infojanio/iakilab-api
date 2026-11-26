import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { Heading, Panel, usePaths } from '../components/common'
import { SampleInspection } from '../components/SampleInspection'
import { SampleLabels } from '../components/SampleLabels'
import { useAuth } from '../context/AuthContext'
import { date } from '../data/demo'
import { samplesService } from '../services/resources'
import type { SampleDTO } from '../types/report'

export default function SampleDetail() {
 const { id } = useParams()
 const { base, demo } = usePaths()
 const { user } = useAuth()
 if (demo || !id) return <Navigate to={base + '/samples'} replace/>
 return <SampleDetailContent key={JSON.stringify([user?.id, user?.laboratoryId, id])}
  id={id} base={base} laboratoryId={user?.laboratoryId}/>
}

function SampleDetailContent({ id, base, laboratoryId }: { id: string; base: string; laboratoryId?: string }) {
 const [sample, setSample] = useState<SampleDTO>()
 const [error, setError] = useState('')
 const [printing, setPrinting] = useState(false)
 useEffect(() => {
  let active = true
  samplesService.byId(id, laboratoryId)
   .then(sample => { if (active) setSample(sample) })
   .catch(error => { if (active) setError(error.message) })
  return () => { active = false }
 }, [id, laboratoryId])

 return <>
  <Link className="back-link" to={base + '/samples'}>Voltar às amostras</Link>
  <Heading title={sample?.identification || 'Detalhe da amostra'} description="Confira os dados da amostra e imprima a etiqueta de identificação." action={sample &&
   <button className="button primary" onClick={() => setPrinting(true)}><Printer size={16}/>Imprimir etiqueta</button>}/>
  {error ? <p role="alert" className="error">{error}</p> : sample ?
   <Panel><dl>
    <dt>Código da amostra</dt><dd>{sample.identification}</dd>
    <dt>Tipo</dt><dd>{sample.type}</dd>
    <dt>Origem</dt><dd>{sample.origin || '—'}</dd>
    <dt>Coleta</dt><dd>{date(sample.collectedAt)}</dd>
    <dt>Situação</dt><dd>{sample.inspectionDecision ? sample.status : 'Sem inspeção registrada'}</dd>
    {!sample.inspectionDecision&&<><dt>Situação cadastrada</dt><dd>{sample.status}</dd></>}
    {sample.serviceOrderId&&<><dt>Ordem de serviço</dt><dd><Link to={base+'/service-orders/'+sample.serviceOrderId}>Abrir OS</Link></dd></>}
    <dt>Análises</dt><dd>{sample.analyses.join(', ') || '—'}</dd>
   </dl></Panel> : <p role="status">Carregando amostra…</p>}
  {sample&&<SampleInspection sample={sample} laboratoryId={laboratoryId} onChange={setSample}/>}
  {sample && printing && <SampleLabels ids={[sample.id]} laboratoryId={laboratoryId} onClose={() => setPrinting(false)}/>}
 </>
}
