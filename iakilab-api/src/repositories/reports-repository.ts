import type {Report,ReportVersion,ReportFile} from '@prisma/client'
export type ReportRecord=Report & {versions:(ReportVersion & {files:ReportFile[]})[]}
export type ReportFilters={page:number;perPage:number;search?:string;stage?:string;signed?:boolean;startDate?:Date;endDate?:Date}
export interface ReportsRepository {
 list(laboratoryId:string,filter:ReportFilters):Promise<{rows:ReportRecord[];total:number}>
 find(laboratoryId:string,id:string):Promise<ReportRecord|null>
}
