import type {Actor} from '../domain.js'
declare module 'fastify' { interface FastifyRequest {actor:Actor} }
declare module '@fastify/jwt' { interface FastifyJWT {payload:{sub:string;sid:string;type:'access'};user:{sub:string;sid:string;type:'access'}} }
