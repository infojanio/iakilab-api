import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ReadPlatform } from '../../../use-cases/platform/read-platform.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'

export async function platformRoutes(app: FastifyInstance, auth: AuthService, service: ReadPlatform) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/laboratories', secure, req => service.list(req.actor, 'laboratories'))
  app.get('/plans', secure, req => service.list(req.actor, 'plans'))
  app.get('/subscriptions', secure, req => service.list(req.actor, 'subscriptions'))
}
