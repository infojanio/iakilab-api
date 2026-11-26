import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Heading, Panel, SearchBox, usePaths } from '../components/common'
import { SampleLabels } from '../components/SampleLabels'
import { inspectionLabels } from '../components/SampleInspection'
import { useAuth } from '../context/AuthContext'
import { samplesService } from '../services/resources'
import { reportsService } from '../services/reports'
import { ordersService, type ServiceOrder, type ServiceOrderDetail, type WorkQueue } from '../services/service-orders'

const queueTitles: Record<WorkQueue,string> = {
 reception: 'Amostras aguardando recebimento',
 analysis: 'Amostras com resultados pendentes',
 recollection: 'Amostras para avaliar recoleta',
 review: 'Laudos aguardando revisão',
}

export function ServiceOrders() {
 const {demo,base}=usePaths()
 const {user}=useAuth()
 const navigate=useNavigate()
 const [orders,setOrders]=useState<ServiceOrder[]>()
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const laboratoryId=user?.laboratoryId
 useEffect(()=>{
  if(demo)return
  let active=true
  ordersService.list(laboratoryId).then(value=>{if(active)setOrders(value)})
   .catch(error=>{if(active)setError(error.message)})
  return()=>{active=false}
 },[demo,laboratoryId])
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(busy)return
  setError('')
  setBusy(true)
  const number=String(new FormData(event.currentTarget).get('number')||'').trim()
  try{const order=await ordersService.create(number,laboratoryId);navigate(base+'/service-orders/'+order.id)}
  catch(error){setError(error instanceof Error ? error.message : 'Não foi possível criar a OS.')}
  finally{setBusy(false)}
 }
 if(demo)return <Navigate to={base} replace/>
 return <>
  <Heading title="Ordens de serviço" description="Acompanhe as visitas, o recebimento das amostras e a revisão dos laudos."/>
  <Panel title="Nova ordem de serviço">
   <form className="report-form" onSubmit={create}>
    <label className="field">Número da OS<input name="number" required maxLength={200} disabled={busy}/></label>
    <button className="button primary" disabled={busy}>Criar OS</button>
   </form>
  </Panel>
  {error&&<p role="alert" className="error">{error}</p>}
  <Panel title="Ordens cadastradas">
   {!orders ? (!error&&<p role="status">Carregando ordens…</p>) : orders.length ?
    <ul>{orders.map(order=><li key={order.id}><Link to={base+'/service-orders/'+order.id}>OS {order.number}</Link> · {order.visitCompletedAt?'Visita concluída':'Visita aberta'}</li>)}</ul> :
    <p>Nenhuma ordem de serviço cadastrada.</p>}
  </Panel>
 </>
}

export function OrderDetail() {
 const {id}=useParams()
 const {base,demo}=usePaths()
 const {user}=useAuth()
 if(demo||!id)return <Navigate to={base+'/service-orders'} replace/>
 return <OrderDetailContent key={id+':'+user?.laboratoryId} id={id} base={base} laboratoryId={user?.laboratoryId} canReview={user?.role==='ADMIN'}/>
}

function OrderDetailContent({id,base,laboratoryId,canReview}:{
 id:string; base:string; laboratoryId?:string; canReview:boolean
}) {
 const [order,setOrder]=useState<ServiceOrderDetail>()
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [selected,setSelected]=useState<string[]>([])
 const [printIds,setPrintIds]=useState<string[]>()
 const [params,setParams]=useSearchParams()
 const priority:WorkQueue[]=canReview?['review','reception','analysis','recollection']:['analysis','reception','recollection']
 const requested=params.get('queue')
 const queue=priority.find(value=>value===requested)
 const next=order&&priority.find(value=>order.pending[value].length>0)
 useEffect(()=>{
  let active=true
  ordersService.detail(id,laboratoryId).then(value=>{if(active)setOrder(value)})
   .catch(error=>{if(active)setError(error.message)})
  return()=>{active=false}
 },[id,laboratoryId])
 async function update(operation:()=>Promise<ServiceOrderDetail>){
  if(busy)return
  setBusy(true)
  setError('')
  try{setOrder(await operation())}
  catch(error){setError(error instanceof Error ? error.message : 'Não foi possível atualizar a OS.')}
  finally{setBusy(false)}
 }
 const samples=order?.samples.filter(sample=>!queue||queue==='review'||order.pending[queue].includes(sample.id))
 const reports=order?.reports.filter(report=>queue!=='review'||order.pending.review.includes(report.id))

 return <>
  <Link className="back-link" to={base+'/service-orders'}>Voltar às ordens de serviço</Link>
  <Heading title={order?'OS '+order.number:'Ordem de serviço'} description="Situação da visita e pendências da ordem."/>
  {error&&<p role="alert" className="error">{error}</p>}
  {!order ? (!error&&<p role="status">Carregando ordem…</p>) : <>
   <Panel title="Visita">
    <p>{order.visitCompletedAt?'Visita concluída em '+new Date(order.visitCompletedAt).toLocaleString('pt-BR'):'Visita aberta.'}</p>
    {!order.visitCompletedAt&&<button className="button" disabled={busy} onClick={()=>void update(()=>ordersService.complete(id,laboratoryId))}>Concluir visita</button>}
   </Panel>
   <Panel title="Próxima ação">
    {next ? <>
     <p><strong>{queueTitles[next]}</strong></p>
     <div className="modal-actions">
      {priority.filter(key=>order.pending[key].length>0).map(key=>
       <button className={key===next?'button primary':'button'} key={key} onClick={()=>setParams({queue:key})}>
        {queueTitles[key]} ({order.pending[key].length})
       </button>)}
     </div>
    </> : <p>Nenhuma pendência para o seu perfil.</p>}
    {queue&&<button className="text-button" onClick={()=>setParams({})}>Ver todos os registros</button>}
   </Panel>
   {queue!=='review'&&<Panel title={queue?queueTitles[queue]:'Amostras vinculadas'}>
    {samples?.length ? <div className="table-wrap"><table><thead><tr><th>Selecionar</th><th>Código</th><th>Inspeção</th><th>Motivo</th><th>Análise</th></tr></thead>
     <tbody>{samples.map(sample=><tr key={sample.id}>
      <td><input type="checkbox" aria-label={'Selecionar '+sample.identification} checked={selected.includes(sample.id)} disabled={sample.active===false}
       onChange={event=>{const checked=event.target.checked;setSelected(previous=>checked?[...previous,sample.id]:previous.filter(x=>x!==sample.id))}}/></td>
      <td>{sample.active===false?sample.identification+' (arquivada)':<Link to={base+'/samples/'+sample.id}>{sample.identification}</Link>}</td>
      <td>{sample.inspectionDecision ? inspectionLabels[sample.inspectionDecision] : 'Sem inspeção registrada'}</td>
      <td>{sample.inspectionReason||'—'}</td>
      <td>{sample.analysisResult?'Resultado registrado':sample.analysisStartedAt?'Em análise':order.pending.analysis.includes(sample.id)?'A iniciar':'—'}</td>
     </tr>)}</tbody></table></div>:<p>Nenhuma amostra nesta lista.</p>}
    {!queue&&<button className="button" disabled={!selected.length} onClick={()=>setPrintIds(selected)}>Imprimir etiquetas ({selected.length})</button>}
    {!queue&&<AttachRecord kind="samples" laboratoryId={laboratoryId} busy={busy}
     linkedIds={order.samples.map(sample=>sample.id)} onAttach={sampleId=>void update(()=>ordersService.attach(id,'samples',sampleId,laboratoryId))}/>}
   </Panel>}
   {(!queue||queue==='review')&&<Panel title={queue?queueTitles.review:'Laudos vinculados'}>
    {reports?.length ? <ul>{reports.map(report=><li key={report.id}><Link to={base+'/reports/'+report.id}>{report.identification}</Link>{report.stage==='AWAITING_VALIDATION'&&' · Aguardando revisão'}</li>)}</ul> :
     <p>Nenhum laudo nesta lista.</p>}
    {!queue&&<AttachRecord kind="reports" laboratoryId={laboratoryId} busy={busy}
     linkedIds={order.reports.map(report=>report.id)} onAttach={reportId=>void update(()=>ordersService.attach(id,'reports',reportId,laboratoryId))}/>}
   </Panel>}
  </>}
  {printIds&&<SampleLabels ids={printIds} laboratoryId={laboratoryId} onClose={()=>setPrintIds(undefined)}/>}
 </>
}

function AttachRecord({kind,laboratoryId,busy,linkedIds,onAttach}:{
 kind:'samples'|'reports'; laboratoryId?:string; busy:boolean; linkedIds:string[]; onAttach:(id:string)=>void
}) {
 const [input,setInput]=useState('')
 const [query,setQuery]=useState<string>()
 const [options,setOptions]=useState<{id:string;identification?:string}[]>()
 const [error,setError]=useState('')
 useEffect(()=>{
  if(query===undefined)return
  let active=true
  const promise=kind==='samples'
   ? samplesService.list(laboratoryId).then(rows=>rows.filter(sample=>!sample.serviceOrderId&&sample.identification.toLowerCase().includes(query.toLowerCase())))
   : reportsService.list({search:query,perPage:20},laboratoryId||'').then(page=>page.reports.filter(report=>!report.serviceOrderId))
  promise.then(rows=>{if(active)setOptions(rows)}).catch(error=>{if(active)setError(error.message)})
  return()=>{active=false}
 },[kind,laboratoryId,query])
 const available=options?.filter(row=>!linkedIds.includes(row.id))
 return <>
  <form className="filters" onSubmit={event=>{event.preventDefault();const next=input.trim();if(next!==query){setOptions(undefined);setError('');setQuery(next)}}}>
   <SearchBox value={input} onChange={setInput} placeholder={kind==='samples'?'Buscar amostra para vincular':'Buscar laudo para vincular'}/>
   <button className="button">Buscar</button>
  </form>
  {error&&<p role="alert" className="error">{error}</p>}
  {query!==undefined&&!available&&!error&&<p role="status">Buscando…</p>}
  {available&&(!available.length?<p>Nenhum registro disponível para vincular.</p>:<ul>
   {available.map(row=><li key={row.id}>{row.identification||row.id} <button className="button small" disabled={busy} onClick={()=>onAttach(row.id)}>Vincular</button></li>)}
  </ul>)}
 </>
}
