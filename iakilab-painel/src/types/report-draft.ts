import type {CreateReportDTO} from './report'
export type ReportKind = 'WATER' | 'SOIL' | 'PDF_UPLOAD'
export type AnalysisGroup = 'PHYSICOCHEMICAL' | 'BACTERIOLOGICAL' | 'SOIL'
export type ParameterDefinition = {id:string;parameter:string;unit:string;method:string;reference:string;group:AnalysisGroup}
export type DraftResult = ParameterDefinition & {result:string;assayDate:string}
export type SoilSampleDraft = {id:string;analyticalCode:string;identification:string;depth:string;results:Record<string,string>}
export type LaboratoryIdentity = {name:string;legalName:string;document:string;address:string;email:string;phone:string;logoUrl?:string}
// Contrato proposto para rascunhos da nova API, separado do POST legado que emite/assina.
export type StructuredReportDraftDTO = CreateReportDTO & {
 reportKind:Exclude<ReportKind,'PDF_UPLOAD'>;templateVersion:'1';identification:string;
 municipality:string;requester:string;property:string;crop:string;resultSentDate:string;issuedDate:string;
 sampleMunicipality:string;latitude:string;longitude:string;arrivalTime:string;rainCondition:string;
 normativeReference:string;classification:string;methodology:string;recommendations:string;technicianRegistration:string;
 waterResults:DraftResult[];soilParameters:ParameterDefinition[];soilSamples:SoilSampleDraft[];
}
export type PdfImportDraftDTO = {reportKind:'PDF_UPLOAD';identification:string;customerName:string;laboratoryId?:string;notes:string;file:File}
