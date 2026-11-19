import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { SessionResponse } from './session-cookie.js'
import { z } from 'zod'
import { AppError } from '../../../domain.js'

export function refresh(auth: AuthService, send: SessionResponse) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const raw = req.cookies.iakilab_refresh
    if (!raw) throw new AppError(401, 'INVALID_REFRESH_TOKEN')
    return send(reply, await auth.refresh(z.string().max(128).parse(raw)))
  }
}
