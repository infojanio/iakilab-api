import type {ReportKind, StructuredReportDraftDTO} from './report-draft'
export type ReportStatus = 'RASCUNHO' | 'AGUARDANDO_VALIDACAO' | 'VALIDADO' | 'ASSINADO'
export type AnalysisResult = { parameter: string; result: string; unit: string; reference: string }
// Campos preservados do contrato Report LabMoura. Confirmar schema no backend antes de habilitar gravação.
export type Report = {
 revision?:number; issuanceFailureCode?:string; publicCode?:string; signatureStatus?:'NOT_REQUESTED'|'PENDING'|'FAILED'|'VERIFIED'; reportKind?:ReportKind; draftData?:Partial<StructuredReportDraftDTO>;
 id: string; identification?: string; laboratoryId?: string; status?: ReportStatus;
 createdAt?: string; customerName?: string; document?: string; address?: string;
 phone?: string; email?: string; technicianName?: string; sampleOrigin?: string;
 sampleType?: string; entryDate?: string; collectionDate?: string; collectionTime?: string;
 collectionAgent?: string; analysisResults?: AnalysisResult[] | unknown; notes?: string;
 sampleImageUrls?: string[]; signedPdfUrl?: string; originalPdfUrl?: string;
 validationHistory?: {date:string; description:string}[];
}
export type ReportsPage = { reports: Report[]; totalPages: number; total?: number }
export type ReportsFilter = { page?: number; perPage?: number; startDate?: string; endDate?: string; search?: string; status?: ReportStatus }
export type CreateReportDTO = Omit<Report, 'id' | 'createdAt' | 'signedPdfUrl'>
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'ANALISTA'
export type User = {id:string; name:string; email:string; role:Role; laboratoryId?:string; laboratoryName?:string}
export type ClientDTO = {id:string; laboratoryId:string; name:string; document:string; email:string; phone:string; address:string}
export type SampleDTO = {id:string; laboratoryId:string; identification:string; type:string; origin:string; collectedAt:string; status:string; analyses:string[]}
export type LaboratoryDTO = {id:string; name:string; document:string; responsible:string; planId:string; subscriptionStatus:string;active?:boolean}
export type PlanDTO = {id:string; name:string; price:number; users:number; reports:number; storageGB:number; features:string[];active?:boolean}
export type SubscriptionDTO = {id:string; laboratoryId:string; planId:string; startsAt:string; expiresAt:string; status:string; autoRenew:boolean}
