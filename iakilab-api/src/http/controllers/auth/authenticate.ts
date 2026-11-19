import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { SessionResponse } from './session-cookie.js'
import { email } from './credentials.js'
import { z } from 'zod'

export function authenticate(auth: AuthService, send: SessionResponse) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const b = z
      .object({
        email,
        password: z
          .string()
          .min(1)
          .max(72)
          .refine((s) => Buffer.byteLength(s, 'utf8') <= 72),
        laboratoryId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body)
    return send(reply, await auth.login(b.email, b.password, b.laboratoryId))
  }
}
