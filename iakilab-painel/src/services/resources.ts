import {API_URL,request,notAvailable} from './api'
import type {ClientDTO,SampleDTO,InspectionDecision,LaboratoryDTO,PlanDTO,SubscriptionDTO} from '../types/report'
function futureResource<T>(path:string){return {list:(laboratoryId?:string)=>request<T[]>(`${path}${laboratoryId?'?laboratoryId='+encodeURIComponent(laboratoryId):''}`),byId:(id:string,laboratoryId?:string)=>request<T>(`${path}/${encodeURIComponent(id)}${laboratoryId?'?laboratoryId='+encodeURIComponent(laboratoryId):''}`),create:async(_data:Partial<T>)=>notAvailable(),update:async(_id:string,_data:Partial<T>)=>notAvailable()}}
export const clientsService=futureResource<ClientDTO>('/clients')
export type SampleLabel = Pick<SampleDTO, 'id' | 'identification' | 'origin'> & { serviceOrderNumber?: string }
export const samplesService = {
 ...futureResource<SampleDTO>('/samples'),
 inspect(id: string, laboratoryId: string | undefined, inspection: {decision:InspectionDecision; condition:string; reason:string}) {
  return sampleWorkflow(id, laboratoryId, '/inspection', inspection)
 },
 startAnalysis(id: string, laboratoryId?: string) {
  return sampleWorkflow(id, laboratoryId, '/analysis/start')
 },
 saveAnalysis(id: string, laboratoryId: string | undefined, result: string) {
  return sampleWorkflow(id, laboratoryId, '/analysis/result', {result})
 },
 labels(ids: string[], laboratoryId?: string) {
  const query = laboratoryId ? '?' + new URLSearchParams({ laboratoryId }) : ''
  return request<SampleLabel[]>('/samples/labels' + query, {
   method: 'POST', body: JSON.stringify({ ids }),
  })
 },
}
function sampleWorkflow(id: string, laboratoryId: string | undefined, action: string, payload?: object) {
 const query = laboratoryId ? '?' + new URLSearchParams({laboratoryId}) : ''
 return request<SampleDTO>('/samples/' + encodeURIComponent(id) + action + query, {
  method:'POST', body:payload && JSON.stringify(payload),
 })
}
export const laboratoriesService=futureResource<LaboratoryDTO>('/laboratories')
export const plansService=futureResource<PlanDTO>('/plans')
export const subscriptionsService=futureResource<SubscriptionDTO>('/subscriptions')
export type PublicReport = {
 identification:string; signatureStatus:'VERIFIED'; issuedAt?:string; downloadUrl:string;
 documentStatus?:'CURRENT'|'SUPERSEDED'; currentCode?:string;
}
export const publicReportsService = {
 async verify(code: string): Promise<PublicReport> {
  const path = '/public/reports/' + encodeURIComponent(code)
  const report = await request<Omit<PublicReport,'downloadUrl'>>(path, {}, {authenticated:false})
  if (report.signatureStatus !== 'VERIFIED') throw new Error('Não foi possível confirmar a assinatura.')
  return {...report,downloadUrl:API_URL + path + '/pdf'}
 },
}
