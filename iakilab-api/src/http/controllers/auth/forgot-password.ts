import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import { email } from './credentials.js'
import { z } from 'zod'

export function forgotPassword(auth: AuthService) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const b = z.object({ email }).strict().parse(req.body)
    await auth.recover(b.email)
    return reply
      .status(202)
      .send({ message: 'Se houver uma conta, as instruções serão enviadas.' })
  }
}
