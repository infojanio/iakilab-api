import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import { requestedLaboratory } from '../request-scope.js'

export function getLaboratoryProfile(auth: AuthService) {
  return async (req: FastifyRequest) =>
    auth.laboratoryProfile(req.actor, requestedLaboratory(req.query))
}
