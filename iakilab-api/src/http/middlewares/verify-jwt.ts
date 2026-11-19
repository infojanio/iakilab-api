import type {FastifyRequest,FastifyReply} from 'fastify'
import type {AuthService} from '../../use-cases/auth/auth-service.js'
import {AppError} from '../../domain.js'
export function verifyJWT(auth:AuthService){return async(req:FastifyRequest,_reply:FastifyReply)=>{
 try{await req.jwtVerify({onlyCookie:false})}catch{throw new AppError(401,'INVALID_ACCESS_TOKEN')}
 if(req.user.type!=='access'||!req.user.sid)throw new AppError(401,'INVALID_ACCESS_TOKEN')
 req.actor=await auth.actor(req.user.sid)
 if(req.actor.user.id!==req.user.sub)throw new AppError(401,'INVALID_ACCESS_TOKEN')
}}
