import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from './common'
import { inspectionLabels } from './SampleInspection'
import { ordersService } from '../services/service-orders'
import type { SampleDTO } from '../types/report'

export function OrderInspectionNotes({ orderId, laboratoryId, base }: { orderId:string; laboratoryId?:string; base:string }) {
 const [samples,setSamples]=useState<SampleDTO[]>()
 const [error,setError]=useState(false)
 useEffect(()=>{
  let active=true
  ordersService.detail(orderId,laboratoryId)
   .then(order=>{if(active)setSamples(order.samples.filter(sample=>sample.inspectionDecision==='ACCEPTED_WITH_RESERVATION'||sample.inspectionDecision==='REJECTED'))})
   .catch(()=>{if(active)setError(true)})
  return()=>{active=false}
 },[orderId,laboratoryId])
 return <Panel title="Ocorrências da inspeção">
  <Link to={base+'/service-orders/'+orderId}>Abrir ordem de serviço</Link>
  {error ? <p role="alert">Não foi possível consultar a inspeção das amostras desta OS.</p> : !samples ?
   <p role="status">Consultando inspeções…</p> : samples.length ? <ul>
    {samples.map(sample=><li key={sample.id}>{sample.active===false?sample.identification+' (arquivada)':<Link to={base+'/samples/'+sample.id}>{sample.identification}</Link>}
     {' · '+inspectionLabels[sample.inspectionDecision!]+': '+sample.inspectionReason}</li>)}
   </ul> : <p>Nenhuma ressalva ou rejeição registrada nesta OS.</p>}
 </Panel>
}
