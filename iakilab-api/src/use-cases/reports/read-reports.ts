import {AppError} from '../../domain.js'
import type {ReportRecord,ReportsRepository,ReportFilters} from '../../repositories/reports-repository.js'
export function verifiedFile(r:ReportRecord){
 const v=r.versions[0]
 if(r.stage!=='ISSUED'||!v||v.laboratoryId!==r.laboratoryId||v.reportId!==r.id||!v.issuedAt||v.signatureStatus!=='VERIFIED'||!v.signatureVerifiedAt||!v.signedSha256)return undefined
 return v.files.find(f=>f.kind==='SIGNED'&&f.laboratoryId===r.laboratoryId&&f.sha256===v.signedSha256)
}
export function reportDTO(r:ReportRecord){
 const file=verifiedFile(r)
 const legacy=['document','address','phone','email','technicianName','sampleOrigin','sampleType','entryDate','collectionDate','collectionTime','collectionAgent','analysisResults','notes']
 const source=r.stage==='ISSUED'?r.versions[0]?.snapshot:r.draftData
 const data=(source&&typeof source==='object'&&!Array.isArray(source)?source:{}) as Record<string,unknown>
 const mapped=Object.fromEntries(legacy.filter(k=>k in data).map(k=>[k,data[k]]))
 const statuses={DRAFT:'RASCUNHO',AWAITING_VALIDATION:'AGUARDANDO_VALIDACAO',VALIDATED:'VALIDADO',ISSUED:'VALIDADO'}
 return {...mapped,id:r.id,laboratoryId:r.laboratoryId,identification:r.identification,revision:r.revision,customerName:r.customerName,createdAt:r.createdAt.toISOString(),status:file?'ASSINADO':statuses[r.stage],reportKind:r.kind,emissionStatus:r.stage,signatureStatus:r.versions[0]?.signatureStatus??'NOT_REQUESTED',signedPdfUrl:file?`/pdf/${r.id}`:undefined,draftData:source??{}}
}
export class ReadReports {
 constructor(private repo:ReportsRepository){}
 async list(lab:string,f:ReportFilters){const {rows,total}=await this.repo.list(lab,f);return {reports:rows.map(reportDTO),total,totalPages:Math.max(1,Math.ceil(total/f.perPage))}}
 async detail(lab:string,id:string){const r=await this.repo.find(lab,id);if(!r)throw new AppError(404,'REPORT_NOT_FOUND');return reportDTO(r)}
 async pdf(lab:string,id:string){const r=await this.repo.find(lab,id);if(!r)throw new AppError(404,'REPORT_NOT_FOUND');const file=verifiedFile(r);if(!file)throw new AppError(409,'SIGNED_PDF_NOT_AVAILABLE');return file}
}
