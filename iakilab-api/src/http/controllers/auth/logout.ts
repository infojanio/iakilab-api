import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { SessionCookie } from './session-cookie.js'

export function logout(auth: AuthService, cookie: SessionCookie) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.cookies.iakilab_refresh)
      await auth.logout(req.cookies.iakilab_refresh)
    reply.clearCookie('iakilab_refresh', cookie)
    return reply.status(204).send()
  }
}
