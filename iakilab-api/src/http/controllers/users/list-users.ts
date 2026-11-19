import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import { requestedLaboratory } from '../request-scope.js'

export function listUsers(auth: AuthService) {
  return async (req: FastifyRequest) => ({
    users: await auth.members(req.actor, requestedLaboratory(req.query)),
  })
}
