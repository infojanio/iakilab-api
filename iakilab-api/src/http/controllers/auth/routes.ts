import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify'
import {z} from 'zod'
import type {AuthService} from '../../../use-cases/auth/auth-service.js'
import type {Config} from '../../../config.js'
import {AppError,type Actor} from '../../../domain.js'
const email=z.string().trim().toLowerCase().email().max(254)
export async function authRoutes(app:FastifyInstance,auth:AuthService,config:Config){
 const cookie={httpOnly:true,secure:config.cookieSecure,sameSite:config.cookieSecure?'none' as const:'lax' as const,path:'/sessions',maxAge:7*86400}
 const csrf=async(req:FastifyRequest)=>{if(!req.headers.origin||!config.origins.includes(req.headers.origin))throw new AppError(403,'ORIGIN_NOT_ALLOWED')}
 const send=async(reply:FastifyReply,result:{actor:Actor;refreshToken:string})=>{
  const accessToken=await reply.jwtSign({sub:result.actor.user.id,sid:result.actor.sessionId,type:'access'},{sign:{expiresIn:'15m'}})
  reply.setCookie('iakilab_refresh',result.refreshToken,cookie)
  return {accessToken}
 }
 const options={preHandler:csrf,config:{rateLimit:{max:10,timeWindow:'1 minute'}}}
 app.post('/sessions',options,async(req,reply)=>{
  const b=z.object({email,password:z.string().min(1).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72),laboratoryId:z.string().uuid().optional()}).strict().parse(req.body)
  return send(reply,await auth.login(b.email,b.password,b.laboratoryId))
 })
 app.post('/sessions/refresh',options,async(req,reply)=>{
  const raw=req.cookies.iakilab_refresh
  if(!raw)throw new AppError(401,'INVALID_REFRESH_TOKEN')
  return send(reply,await auth.refresh(z.string().max(128).parse(raw)))
 })
 app.post('/sessions/logout',options,async(req,reply)=>{
  if(req.cookies.iakilab_refresh)await auth.logout(req.cookies.iakilab_refresh)
  reply.clearCookie('iakilab_refresh',cookie);return reply.status(204).send()
 })
 app.post('/password/forgot',options,async(req,reply)=>{const b=z.object({email}).strict().parse(req.body);await auth.recover(b.email);return reply.status(202).send({message:'Se houver uma conta, as instruções serão enviadas.'})})
 app.post('/password/reset',options,async(req,reply)=>{const b=z.object({token:z.string().min(32).max(128),newPassword:z.string().min(12).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72)}).strict().parse(req.body);await auth.reset(b.token,b.newPassword);return reply.status(204).send()})
}
