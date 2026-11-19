import {request,notAvailable} from './api'
import type {ClientDTO,SampleDTO,LaboratoryDTO,PlanDTO,SubscriptionDTO} from '../types/report'
function futureResource<T>(path:string){return {list:(laboratoryId?:string)=>request<T[]>(`${path}${laboratoryId?'?laboratoryId='+encodeURIComponent(laboratoryId):''}`),byId:(id:string)=>request<T>(`${path}/${encodeURIComponent(id)}`),create:async(_data:Partial<T>)=>notAvailable(),update:async(_id:string,_data:Partial<T>)=>notAvailable()}}
export const clientsService=futureResource<ClientDTO>('/clients')
export const samplesService=futureResource<SampleDTO>('/samples')
export const laboratoriesService=futureResource<LaboratoryDTO>('/laboratories')
export const plansService=futureResource<PlanDTO>('/plans')
export const subscriptionsService=futureResource<SubscriptionDTO>('/subscriptions')
export const publicReportsService={verify:async(_code:string):Promise<{identification:string;signatureStatus:string;authorizedPdfUrl?:string}>=>notAvailable()}
