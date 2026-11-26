import {AppError} from '../../domain.js'
import type {ReportRecord,ReportsRepository,ReportFilters} from '../../repositories/reports-repository.js'
export function verifiedFile(r:ReportRecord){
 const v=r.versions[0]
 if(r.stage!=='ISSUED'||!v||v.laboratoryId!==r.laboratoryId||v.reportId!==r.id||!v.issuedAt||v.signatureStatus!=='VERIFIED'||!v.signatureVerifiedAt||!v.signedSha256)return undefined
 return v.files.find(f=>f.kind==='SIGNED'&&f.laboratoryId===r.laboratoryId&&f.sha256===v.signedSha256)
}
export function originalFile(report: ReportRecord) {
 if (report.kind !== 'PDF_UPLOAD') return undefined
 return report.versions.flatMap(version => version.files).find(file => file.kind === 'ORIGINAL' && file.laboratoryId === report.laboratoryId)
}
export function reportDTO(r:ReportRecord){
 const file=verifiedFile(r)
 const legacy=['document','address','phone','email','technicianName','sampleOrigin','sampleType','entryDate','collectionDate','collectionTime','collectionAgent','analysisResults','notes']
 const source=r.stage==='ISSUED'?r.versions[0]?.snapshot:r.draftData
 const data=(source&&typeof source==='object'&&!Array.isArray(source)?source:{}) as Record<string,unknown>
 const mapped=Object.fromEntries(legacy.filter(k=>k in data).map(k=>[k,data[k]]))
 const descriptions:Record<string,string>={CREATED:'Rascunho criado',RECTIFICATION_STARTED:'Rascunho de retificação criado',RECTIFICATION_PDF_REPLACED:'PDF corrigido anexado',EDITED:'Rascunho editado',SUBMITTED:'Enviado para revisão',RETURNED:'Devolvido para ajustes',VALIDATED:'Laudo validado',ISSUED:'Laudo emitido e assinado',ISSUANCE_FAILED:'Falha na emissão'}
 const validationHistory=r.events?.map(event=>({date:event.createdAt.toISOString(),description:descriptions[event.action]??event.action}))
 const statuses={DRAFT:'RASCUNHO',AWAITING_VALIDATION:'AGUARDANDO_VALIDACAO',VALIDATED:'VALIDADO',ISSUED:'VALIDADO'}
 return {...mapped,id:r.id,laboratoryId:r.laboratoryId,identification:r.identification,serviceOrderId:r.serviceOrderId??undefined,rectifiesId:r.rectifiesId??undefined,revision:r.revision,customerName:r.customerName,createdAt:r.createdAt.toISOString(),status:file?'ASSINADO':statuses[r.stage],reportKind:r.kind,emissionStatus:r.stage,signatureStatus:file?'VERIFIED':r.issuanceAttempt?'PENDING':r.issuanceFailedAt?'FAILED':r.versions[0]?.signatureStatus??'NOT_REQUESTED',issuanceFailureCode:r.stage==='VALIDATED'&&r.issuanceFailedAt?r.issuanceFailureCode??undefined:undefined,publicCode:file?r.publicCode??undefined:undefined,originalPdfUrl:originalFile(r)?`/pdf/${r.id}?variant=original`:undefined,signedPdfUrl:file?`/pdf/${r.id}`:undefined,draftData:source??{},validationHistory}
}
export class ReadReports {
 constructor(private repo:ReportsRepository){}
 async list(lab:string,f:ReportFilters){const {rows,total}=await this.repo.list(lab,f);return {reports:rows.map(reportDTO),total,totalPages:Math.max(1,Math.ceil(total/f.perPage))}}
 async detail(lab:string,id:string){const r=await this.repo.find(lab,id);if(!r)throw new AppError(404,'REPORT_NOT_FOUND');return reportDTO(r)}
 async pdf(lab:string,id:string,variant:'signed'|'original'='signed'){const r=await this.repo.find(lab,id);if(!r)throw new AppError(404,'REPORT_NOT_FOUND');const file=variant==='original'?originalFile(r):verifiedFile(r)
  if(!file)throw new AppError(409,variant==='original'?'ORIGINAL_PDF_NOT_AVAILABLE':'SIGNED_PDF_NOT_AVAILABLE')
  return file}
}
