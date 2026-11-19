import type {FastifyInstance} from 'fastify'
import type {AuthService} from '../../../use-cases/auth/auth-service.js'
import {z} from 'zod'
import {verifyJWT} from '../../middlewares/verify-jwt.js'
export async function usersRoutes(app:FastifyInstance,auth:AuthService){
 const scope=(query:unknown)=>z.object({laboratoryId:z.string().uuid().optional()}).strict().parse(query).laboratoryId
 app.get('/laboratories/me',{preHandler:verifyJWT(auth)},async req=>auth.laboratoryProfile(req.actor,scope(req.query)))
 app.get('/users',{preHandler:verifyJWT(auth)},async req=>({users:await auth.members(req.actor,scope(req.query))}))
 app.get('/users/me',{preHandler:verifyJWT(auth)},async req=>({id:req.actor.user.id,name:req.actor.user.name,email:req.actor.user.email,role:req.actor.role,laboratoryId:req.actor.laboratoryId??undefined,laboratoryName:req.actor.laboratoryName}))
}
