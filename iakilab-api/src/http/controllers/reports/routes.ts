import type {FastifyInstance} from 'fastify'
import {z} from 'zod'
import type {AuthService} from '../../../use-cases/auth/auth-service.js'
import type {ReadReports} from '../../../use-cases/reports/read-reports.js'
import type {PdfStorage} from '../../../lib/pdf-storage.js'
import {verifyJWT} from '../../middlewares/verify-jwt.js'
import {AppError} from '../../../domain.js'
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s)
export async function reportsRoutes(app:FastifyInstance,auth:AuthService,reports:ReadReports,storage:PdfStorage){
 const secure={preHandler:verifyJWT(auth)}
 app.get('/reports',secure,async req=>{
  const f=z.object({laboratoryId:z.string().uuid().optional(),page:z.coerce.number().int().min(1).max(100000).default(1),perPage:z.coerce.number().int().min(1).max(100).default(20),search:z.string().max(200).optional(),status:z.enum(['RASCUNHO','AGUARDANDO_VALIDACAO','VALIDADO','ASSINADO']).optional(),startDate:date.optional(),endDate:date.optional()}).strict().parse(req.query)
  if(f.startDate&&f.endDate&&f.startDate>f.endDate)throw new AppError(400,'INVALID_DATE_RANGE')
  const lab=await auth.tenant(req.actor,f.laboratoryId)
  const stage=f.status?{RASCUNHO:'DRAFT',AGUARDANDO_VALIDACAO:'AWAITING_VALIDATION',VALIDADO:'VALIDATED',ASSINADO:undefined}[f.status]:undefined
  return reports.list(lab,{...f,stage,signed:f.status==='ASSINADO',startDate:f.startDate?new Date(f.startDate):undefined,endDate:f.endDate?new Date(Date.parse(f.endDate)+86400000):undefined})
 })
 app.get('/reports/:id',secure,async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const q=z.object({laboratoryId:z.string().uuid().optional()}).strict().parse(req.query);return reports.detail(await auth.tenant(req.actor,q.laboratoryId),id)})
 // Alias matches the frontend's same-origin /pdf/ URL guard. A bearer token is still mandatory.
 app.get('/pdf/:id',secure,async(req,reply)=>{
  const {id}=z.object({id:z.string().uuid()}).parse(req.params)
  const q=z.object({laboratoryId:z.string().uuid().optional(),variant:z.enum(['signed','original']).optional()}).strict().parse(req.query)
  const lab=await auth.tenant(req.actor,q.laboratoryId)
  const f=await reports.pdf(lab,id,q.variant);const bytes=await storage.read(f.storageKey,f.sha256,f.byteLength)
  req.log.info({event:'PDF_READ',userId:req.actor.user.id,laboratoryId:lab,reportId:id,fileId:f.id})
  return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`inline; filename="laudo-${id}.pdf"`).type('application/pdf').send(bytes)
 })
}
