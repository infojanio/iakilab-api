import type {FastifyRequest,FastifyReply} from 'fastify'
import {AppError,type Role} from '../../domain.js'
export const verifyUserRole=(...roles:Role[])=>async(req:FastifyRequest,_reply:FastifyReply)=>{if(!roles.includes(req.actor.role))throw new AppError(403,'ROLE_NOT_ALLOWED')}
