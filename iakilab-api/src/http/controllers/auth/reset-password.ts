import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import { z } from 'zod'

export function resetPassword(auth: AuthService) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const b = z
      .object({
        token: z.string().min(32).max(128),
        newPassword: z
          .string()
          .min(12)
          .max(72)
          .refine((s) => Buffer.byteLength(s, 'utf8') <= 72),
      })
      .strict()
      .parse(req.body)
    await auth.reset(b.token, b.newPassword)
    return reply.status(204).send()
  }
}
