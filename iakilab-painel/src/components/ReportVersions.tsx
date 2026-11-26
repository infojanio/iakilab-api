import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Modal, Panel } from './common'
import { reportsService, type ReportVersionEntry, type ReportVersions as Versions } from '../services/reports'

const statuses: Record<ReportVersionEntry['status'],string> = {
 DRAFT: 'Rascunho', AWAITING_VALIDATION: 'Aguardando revisão', VALIDATED: 'Validado',
 ISSUED: 'Emitido', ISSUANCE_FAILED: 'Falha na assinatura ou publicação', SUPERSEDED: 'Substituído',
}

export function ReportVersions({ reportId, laboratoryId, base }: { reportId:string; laboratoryId:string; base:string }) {
 const navigate=useNavigate()
 const [history,setHistory]=useState<Versions>()
 const [loadError,setLoadError]=useState('')
 const [open,setOpen]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 useEffect(()=>{
  let active=true
  reportsService.versions(reportId,laboratoryId)
   .then(data=>{if(active)setHistory(data)}).catch(error=>{if(active)setLoadError(error.message)})
  return()=>{active=false}
 },[reportId,laboratoryId])
 async function start(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(saving)return
  const reason=String(new FormData(event.currentTarget).get('reason')||'').trim()
  if(!reason){setError('Informe o motivo da retificação.');return}
  setSaving(true)
  setError('')
  try{
   const draft=await reportsService.rectify(reportId,laboratoryId,reason)
   navigate(base+'/reports/'+draft.id,{state:{feedback:'Rascunho de retificação criado.'}})
  }catch(error){setError(error instanceof Error?error.message:'Não foi possível iniciar a retificação.')}
  finally{setSaving(false)}
 }
 return <>
  <Panel title="Versões do laudo" action={history?.canStart&&<button className="button" onClick={()=>{setError('');setOpen(true)}}>Iniciar retificação</button>}>
   {loadError ? <p role="alert" className="error">{loadError}</p> : !history ? <p role="status">Consultando versões…</p> :
    <ol className="history">
     {history.versions.map(version=><li key={version.id}>
      <div>{version.id===reportId ? <strong>{version.identification}</strong> : <Link to={base+'/reports/'+version.id}>{version.identification}</Link>}
       {' · Versão '+version.number+' · '+(version.current?'Vigente':statuses[version.status])}</div>
      <div>{new Date(version.issuedAt??version.createdAt).toLocaleString('pt-BR')}</div>
      {version.actorName&&<div>Retificação aberta por {version.actorName} em {new Date(version.createdAt).toLocaleString('pt-BR')}</div>}
      {version.issuerName&&<div>Emissão registrada por {version.issuerName}</div>}
      {version.reason&&<div>Motivo da retificação: {version.reason}</div>}
     </li>)}
    </ol>}
  </Panel>
  {open&&<Modal title="Iniciar retificação" onClose={()=>{if(!saving)setOpen(false)}}>
   <form className="report-form" onSubmit={start}>
    <p>A versão atual permanece vigente até a publicação da retificação.</p>
    <label className="field">Motivo da retificação<textarea name="reason" maxLength={2000} required disabled={saving}/></label>
    {error&&<p role="alert" className="error">{error}</p>}
    <button className="button primary" disabled={saving}>{saving?'Abrindo rascunho…':'Criar rascunho de retificação'}</button>
   </form>
  </Modal>}
 </>
}

export function RectificationPdf({ reportId, laboratoryId, revision, onSaved }: {
 reportId:string; laboratoryId:string; revision:number; onSaved:()=>void
}) {
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 async function upload(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  const file=new FormData(event.currentTarget).get('file')
  if(saving||!(file instanceof File)||!file.size)return
  setSaving(true)
  setError('')
  try{await reportsService.replaceRectificationPdf(reportId,laboratoryId,revision,file);onSaved()}
  catch(error){setError(error instanceof Error?error.message:'Não foi possível anexar o PDF.')}
  finally{setSaving(false)}
 }
 return <Panel title="PDF corrigido">
  <form className="report-form" onSubmit={upload}>
   <label className="field">PDF corrigido sem assinatura<input name="file" type="file" accept=".pdf,application/pdf" required disabled={saving}/></label>
   {error&&<p role="alert" className="error">{error}</p>}
   <button className="button" disabled={saving}>{saving?'Anexando…':'Anexar PDF corrigido'}</button>
  </form>
 </Panel>
}
