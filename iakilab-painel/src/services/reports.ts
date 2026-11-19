import {request,notAvailable} from './api'
import type {Report,ReportsFilter,ReportsPage} from '../types/report'
import type {StructuredReportDraftDTO,PdfImportDraftDTO} from '../types/report-draft'
function record(value:unknown):Record<string,unknown>{if(!value || typeof value!=='object'||Array.isArray(value))throw new Error('Formato de resposta de laudo inválido.');return value as Record<string,unknown>}
export function normalizeReport(value:unknown):Report{const r=record(value);if(typeof r.id!=='string')throw new Error('Laudo sem identificador válido.');return r as Report}
export function normalizeReports(value:unknown):ReportsPage{
 if(Array.isArray(value))return {reports:value.map(normalizeReport),totalPages:1,total:value.length}
 const obj=record(value);if(obj.data&&!Array.isArray(obj.data))return normalizeReports(obj.data)
 const rows=obj.reports??obj.data??obj.items;if(!Array.isArray(rows))throw new Error('Resposta de listagem incompatível.');const meta=(obj.meta&&typeof obj.meta==='object'?obj.meta:obj) as Record<string,unknown>
 return {reports:rows.map(normalizeReport),totalPages:Math.max(1,Number(meta.totalPages)||1),total:typeof meta.total==='number'?meta.total:undefined}
}
export const reportsService={
 async list(filters:ReportsFilter,laboratoryId:string){const qs=new URLSearchParams({laboratoryId});for(const [k,v]of Object.entries(filters))if(v)qs.set(k,String(v));return normalizeReports(await request<unknown>(`/reports?${qs}`))},
 async byId(id:string,laboratoryId:string){const raw=await request<unknown>(`/reports/${encodeURIComponent(id)}?laboratoryId=${encodeURIComponent(laboratoryId)}`);const obj=record(raw);return normalizeReport(obj.report??obj.data??obj)},
 saveDraft:async(_draft:StructuredReportDraftDTO)=>notAvailable(),
 importPdfDraft:async(_draft:PdfImportDraftDTO)=>notAvailable(),
 create:async()=>notAvailable(),validate:async()=>notAvailable(),sign:async()=>notAvailable(),uploadPdf:async()=>notAvailable(),
}
