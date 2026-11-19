import type {PrismaClient,Prisma,ReportStage} from '@prisma/client'
import type {ReportsRepository,ReportFilters} from '../reports-repository.js'
const include={versions:{orderBy:{number:'desc' as const},take:1,include:{files:true}}}
export class PrismaReportsRepository implements ReportsRepository {
 constructor(private db:PrismaClient){}
 async list(laboratoryId:string,f:ReportFilters){
  const where:Prisma.ReportWhereInput={laboratoryId,
   ...(f.search?{OR:[{customerName:{contains:f.search,mode:'insensitive'}},{identification:{contains:f.search,mode:'insensitive'}}]}:{}),
   ...(f.stage?{stage:f.stage==='VALIDATED'?{in:['VALIDATED','ISSUED']}:f.stage as ReportStage}:{}),
   ...(f.startDate||f.endDate?{createdAt:{gte:f.startDate,lt:f.endDate}}:{})}
  // A correlated latest-version predicate is expressed with raw SQL below only for signed filtering.
  if(f.signed||f.stage==='VALIDATED'){
   const latest=await this.db.$queryRaw<{id:string}[]>`SELECT r.id FROM "Report" r JOIN LATERAL (SELECT v.* FROM "ReportVersion" v WHERE v."laboratoryId"=r."laboratoryId" AND v."reportId"=r.id ORDER BY v.number DESC LIMIT 1) v ON true WHERE r."laboratoryId"=${laboratoryId}::uuid AND r.stage='ISSUED' AND v."signatureStatus"='VERIFIED' AND v."signatureVerifiedAt" IS NOT NULL AND v."issuedAt" IS NOT NULL AND EXISTS (SELECT 1 FROM "ReportFile" f WHERE f."versionId"=v.id AND f."laboratoryId"=v."laboratoryId" AND f.kind='SIGNED' AND f.sha256=v."signedSha256")`
   where.id=f.signed?{in:latest.map(x=>x.id)}:{notIn:latest.map(x=>x.id)}
  }
  const [rows,total]=await this.db.$transaction([this.db.report.findMany({where,include,skip:(f.page-1)*f.perPage,take:f.perPage,orderBy:[{createdAt:'desc'},{id:'desc'}]}),this.db.report.count({where})])
  return {rows,total}
 }
 find(laboratoryId:string,id:string){return this.db.report.findUnique({where:{laboratoryId_id:{laboratoryId,id}},include})}
}
