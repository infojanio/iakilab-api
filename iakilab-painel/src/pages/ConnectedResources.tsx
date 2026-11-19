import {useEffect,useState,type FormEvent} from 'react'
import {Heading,Panel,Modal,Empty} from '../components/common'
import {useAuth} from '../context/AuthContext'
import {ApiError,request} from '../services/api'
import {date} from '../data/demo'
import type {ClientDTO,SampleDTO,LaboratoryDTO,PlanDTO,SubscriptionDTO} from '../types/report'

type Resource='clients'|'samples'|'laboratories'|'plans'|'subscriptions'
type Field={key:string;label:string;type?:string;optional?:boolean}
const configs:Record<Resource,{title:string;columns:string[];fields:Field[]}>={
 clients:{title:'Clientes',columns:['Cliente','Documento','Contato'],fields:[
  {key:'name',label:'Nome'},{key:'document',label:'Documento',optional:true},{key:'phone',label:'Telefone',optional:true},
  {key:'email',label:'E-mail',type:'email',optional:true},{key:'address',label:'Endereço',optional:true}]},
 samples:{title:'Amostras',columns:['Identificação','Tipo','Origem','Coleta','Situação'],fields:[
  {key:'identification',label:'Identificação'},{key:'type',label:'Tipo'},{key:'origin',label:'Origem'},
  {key:'collectedAt',label:'Data da coleta',type:'date'},{key:'status',label:'Situação'},{key:'analyses',label:'Análises (uma por linha)',optional:true}]},
 laboratories:{title:'Laboratórios',columns:['Laboratório','Documento','Plano','Assinatura'],fields:[
  {key:'name',label:'Nome do laboratório'},{key:'slug',label:'Identificador (ex. labmoura)'},{key:'document',label:'Documento',optional:true}]},
 plans:{title:'Planos',columns:['Plano','Preço (R$)','Usuários','Laudos','Armazenamento (GB)','Situação'],fields:[
  {key:'name',label:'Nome'},{key:'price',label:'Preço (R$)',type:'number'},{key:'users',label:'Limite de usuários',type:'number'},
  {key:'reports',label:'Limite de laudos',type:'number'},{key:'storageGB',label:'Armazenamento (GB)',type:'number'}]},
 subscriptions:{title:'Assinaturas',columns:['Laboratório','Plano','Início','Vencimento','Situação'],fields:[
  {key:'laboratoryId',label:'Laboratório'},{key:'planId',label:'Plano'},
  {key:'startsAt',label:'Início',type:'date'},{key:'expiresAt',label:'Fim da vigência',type:'date'}]},
}
type Row=ClientDTO|SampleDTO|LaboratoryDTO|PlanDTO|SubscriptionDTO
export function ConnectedResources({resource}:{resource:Resource}){
 const {user}=useAuth()
 return <ResourceTable key={JSON.stringify([user?.id,user?.laboratoryId,resource])} resource={resource}/>
}
function ResourceTable({resource}:{resource:Resource}){
 const {user}=useAuth()
 const scoped=resource==='clients'||resource==='samples'
 const scope=scoped&&user?.laboratoryId?'?laboratoryId='+encodeURIComponent(user.laboratoryId):''
 const canCreate=user?.role==='SUPER_ADMIN'||resource==='samples'||(resource==='clients'&&user?.role==='ADMIN')
 const path='/'+resource
 const {title,columns,fields}=configs[resource]
 const [rows,setRows]=useState<Row[]>([])
 const [labs,setLabs]=useState<LaboratoryDTO[]>([])
 const [plans,setPlans]=useState<PlanDTO[]>([])
 const [editor,setEditor]=useState<Row|'new'|null>(null)
 const [refresh,setRefresh]=useState(0)
 const [loadError,setLoadError]=useState('')
 const [formError,setFormError]=useState('')
 const [success,setSuccess]=useState('')
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 useEffect(()=>{
  let active=true
  setLoading(true)
  setLoadError('')
  Promise.all([
   request<Row[]>(path+scope),
   resource==='subscriptions'?request<LaboratoryDTO[]>('/laboratories'):Promise.resolve([]),
   resource==='subscriptions'||resource==='laboratories'?request<PlanDTO[]>('/plans'):Promise.resolve([]),
  ]).then(([data,laboratories,catalog])=>{
   if(active){setRows(data);setLabs(laboratories);setPlans(catalog)}
  }).catch(error=>{if(active)setLoadError(error.message)})
   .finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[path,scope,resource,refresh])
 function cells(row:Row):string[]{
  if('subscriptionStatus' in row)
   return [row.name,row.document||'—',plans.find(p=>p.id===row.planId)?.name||'—',row.subscriptionStatus]
  if('startsAt' in row) {
   const now=Date.now()
   const status=row.status==='ACTIVE'
    ? now<Date.parse(row.startsAt)?'Programada':now>=Date.parse(row.expiresAt)?'Vencida':'Ativa'
    : row.status
   return [labs.find(l=>l.id===row.laboratoryId)?.name||row.laboratoryId,plans.find(p=>p.id===row.planId)?.name||row.planId,date(row.startsAt),date(row.expiresAt),status]
  }
  if('price' in row)return [row.name,row.price.toFixed(2),String(row.users),String(row.reports),String(row.storageGB),row.active?'Ativo':'Inativo']
  if('collectedAt' in row)return [row.identification,row.type,row.origin,date(row.collectedAt),row.status]
  return [row.name,row.document||'—',row.email||row.phone||'—']
 }
 function open(row:Row|'new'){setFormError('');setSuccess('');setEditor(row)}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(!editor||saving)return
  const form=new FormData(event.currentTarget)
  const payload:Record<string,unknown>=Object.fromEntries(fields.map(field=>[field.key,String(form.get(field.key)??'').trim()]))
  if(resource==='laboratories'&&!payload.document)delete payload.document
  if(resource==='samples')payload.analyses=String(payload.analyses).split('\n').map(value=>value.trim()).filter(Boolean)
  if(resource==='plans'){
   for(const key of ['users','reports','storageGB'])payload[key]=Number(payload[key])
   payload.active=form.has('active')
  }
  setSaving(true)
  setFormError('')
  try{
   await request(path+(editor==='new'?'':'/'+encodeURIComponent(editor.id))+scope,{
    method:editor==='new'?'POST':'PATCH',body:JSON.stringify(payload),
   })
   setEditor(null)
   setSuccess('Registro salvo.')
   setRefresh(value=>value+1)
  }catch(error){
   setFormError(error instanceof ApiError&&error.status===409
    ?'Os dados conflitam com um registro ou período existente. Confira o cadastro antes de tentar novamente.'
    :error instanceof Error?error.message:'Não foi possível salvar.')
  }finally{setSaving(false)}
 }
 const editable=(resource==='plans'||resource==='clients'||resource==='samples')&&canCreate
 return <>
  <Heading title={title} description="Consulte e gerencie os registros disponíveis para o seu perfil."
   action={canCreate&&<button className="button primary" onClick={()=>open('new')}>Novo cadastro</button>}/>
  {success&&<p role="status">{success}</p>}
  <Panel>
   {loading?<p role="status">Carregando…</p>:loadError?<p role="alert">{loadError} <button onClick={()=>setRefresh(value=>value+1)}>Tentar novamente</button></p>:rows.length===0?<Empty/>:
    <div className="table-wrap"><table><thead><tr>{columns.map(column=><th key={column}>{column}</th>)}{editable&&<th>Ações</th>}</tr></thead>
     <tbody>{rows.map(row=><tr key={row.id}>{cells(row).map((cell,i)=><td key={columns[i]}>{cell}</td>)}
      {editable&&<td><button className="button small" onClick={()=>open(row)}>Editar</button></td>}</tr>)}</tbody></table></div>}
  </Panel>
  {editor&&<Modal title={editor==='new'?'Novo cadastro':'Editar cadastro'} onClose={()=>{if(!saving)setEditor(null)}}>
   <form onSubmit={submit}><fieldset disabled={saving}><div className="form-grid">
    {fields.map(field=>{
     const current=editor==='new'?undefined:(editor as unknown as Record<string,unknown>)[field.key]
     const initial=Array.isArray(current)?current.join('\n'):field.type==='date'?String(current??'').slice(0,10):String(current??'')
     const options=resource==='subscriptions'?(field.key==='laboratoryId'?labs:field.key==='planId'?plans:null):null
     return <label className="field" key={field.key}>{field.label}
      {options?<select name={field.key} required defaultValue=""><option value="">Selecione</option>{options.filter(option=>option.active!==false).map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select>
       :field.key==='analyses'?<textarea name={field.key} defaultValue={initial}/>
       :<input name={field.key} required={!field.optional} type={field.type||'text'} min={field.type==='number'?0:undefined} step={field.key==='price'?'0.01':undefined} defaultValue={initial}/>}
     </label>
    })}
    {resource==='plans'&&<label><input type="checkbox" name="active" defaultChecked={editor==='new'||(editor as PlanDTO).active!==false}/> Plano ativo</label>}
   </div>{formError&&<p className="error" role="alert">{formError}</p>}
   <button className="button primary" type="submit">{saving?'Salvando…':'Salvar'}</button>
   </fieldset></form>
  </Modal>}
 </>
}

type Member={id:string;name:string;email:string;role:string;active:boolean}
export function ConnectedMembers(){
 const {user}=useAuth()
 return <MembersTable key={JSON.stringify([user?.id,user?.laboratoryId])}/>
}
function MembersTable(){
 const {user}=useAuth()
 const platform=user?.role==='SUPER_ADMIN'
 const available=platform||user?.role==='ADMIN'
 const [labs,setLabs]=useState<LaboratoryDTO[]>([])
 const [lab,setLab]=useState('')
 const selected=platform?lab:user?.laboratoryId
 const [result,setResult]=useState<{lab:string;members?:Member[];error?:string}>()
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!platform)return
  let active=true
  request<LaboratoryDTO[]>('/laboratories').then(rows=>{if(active)setLabs(rows.filter(row=>row.active!==false))})
   .catch(error=>{if(active)setError(error.message)})
  return()=>{active=false}
 },[platform])
 useEffect(()=>{
  if(!selected||!available)return
  let active=true
  request<{users:Member[]}>('/users?laboratoryId='+encodeURIComponent(selected))
   .then(data=>{if(active)setResult({lab:selected,members:data.users})})
   .catch(error=>{if(active)setResult({lab:selected,error:error.message})})
  return()=>{active=false}
 },[selected,available])
 const current=result?.lab===selected?result:undefined
 return <>
  <Heading title="Usuários" description="Consulte os vínculos e perfis por laboratório."/>
  {!available?<p>Esta consulta requer acesso administrativo.</p>:<Panel>
   {platform&&<label className="field">Laboratório<select value={lab} onChange={event=>{setResult(undefined);setLab(event.target.value)}}>
    <option value="">Selecione</option>
    {labs.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
   </select></label>}
   {error&&<p role="alert">{error}</p>}
   {selected&&(current?.error?<p role="alert">{current.error}</p>:!current?.members?<p role="status">Carregando usuários…</p>:
    current.members.length===0?<Empty/>:<div className="table-wrap">
     <table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th></tr></thead>
      <tbody>{current.members.map(member=><tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{member.role}</td><td>{member.active?'Ativo':'Inativo'}</td></tr>)}</tbody>
     </table>
    </div>)}
  </Panel>}
 </>
}
