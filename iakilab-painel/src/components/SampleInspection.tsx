import { useState, type FormEvent } from 'react'
import { Panel } from './common'
import { samplesService } from '../services/resources'
import type { InspectionDecision, SampleDTO } from '../types/report'

export const inspectionLabels: Record<InspectionDecision,string> = {
 ACCEPTED: 'Aceita',
 ACCEPTED_WITH_RESERVATION: 'Aceita com ressalva',
 REJECTED: 'Rejeitada',
}

export function SampleInspection({ sample, laboratoryId, onChange }: {
 sample: SampleDTO; laboratoryId?: string; onChange: (updated: SampleDTO) => void
}) {
 const [decision,setDecision]=useState<InspectionDecision|''>('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')

 async function save(operation: () => Promise<SampleDTO>) {
  if(busy)return
  setBusy(true)
  setError('')
  try{onChange(await operation())}
  catch(error){setError(error instanceof Error ? error.message : 'Não foi possível concluir a operação.')}
  finally{setBusy(false)}
 }

 function receive(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const data=new FormData(event.currentTarget)
  const condition=String(data.get('condition')||'').trim()
  const reason=String(data.get('reason')||'').trim()
  if(!decision||!condition||(decision!=='ACCEPTED'&&!reason)){
   setError('Informe a condição, selecione a decisão e preencha o motivo quando exigido.')
   return
  }
  void save(()=>samplesService.inspect(sample.id,laboratoryId,{decision,condition,reason}))
 }

 function finish(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const result=String(new FormData(event.currentTarget).get('result')||'').trim()
  void save(()=>samplesService.saveAnalysis(sample.id,laboratoryId,result))
 }

 return <>
  {error&&<p className="error" role="alert">{error}</p>}
  <Panel title="Inspeção no recebimento">
   {sample.inspectionDecision ? <dl>
    <dt>Decisão</dt><dd>{inspectionLabels[sample.inspectionDecision]}</dd>
    <dt>Recebida em</dt><dd>{sample.receivedAt ? new Date(sample.receivedAt).toLocaleString('pt-BR') : '—'}</dd>
    <dt>Responsável</dt><dd>{sample.receivedByName}</dd>
    <dt>Condição de chegada</dt><dd>{sample.arrivalCondition}</dd>
    {sample.inspectionReason&&<><dt>Motivo</dt><dd>{sample.inspectionReason}</dd></>}
    {sample.inspectionDecision==='REJECTED'&&<><dt>Próxima ação</dt><dd>Avaliar recoleta.</dd></>}
   </dl> : <>
    <p>Sem inspeção registrada.</p>
    <form onSubmit={receive} className="report-form">
     <fieldset disabled={busy} className="form-grid">
      <label className="field">Condição de chegada<textarea name="condition" required maxLength={2000}/></label>
      <label className="field">Decisão<select required value={decision} onChange={event=>setDecision(event.target.value as InspectionDecision|'')}>
       <option value="">Selecione uma decisão</option>
       {Object.entries(inspectionLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}
      </select></label>
      {decision&&<label className="field">Motivo{decision==='ACCEPTED' ? ' (opcional)' : ''}<textarea name="reason" required={decision!=='ACCEPTED'} maxLength={2000}/></label>}
     </fieldset>
     <button className="button primary" disabled={busy}>Confirmar recebimento</button>
    </form>
   </>}
  </Panel>
  {sample.inspectionDecision && sample.inspectionDecision!=='REJECTED'&&<Panel title="Análise">
   {sample.inspectionReason&&<p>Observação da inspeção: {sample.inspectionReason}</p>}
   {sample.analysisResult ? <p>{sample.analysisResult}</p> : sample.analysisStartedAt ?
    <form onSubmit={finish} className="report-form">
     <label className="field">Resultado<textarea name="result" required maxLength={10000} disabled={busy}/></label>
     <button className="button primary" disabled={busy}>Registrar resultado</button>
    </form> :
    <button className="button primary" disabled={busy} onClick={()=>void save(()=>samplesService.startAnalysis(sample.id,laboratoryId))}>Iniciar análise</button>}
  </Panel>}
 </>
}
