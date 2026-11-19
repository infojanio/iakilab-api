import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ReadDashboard } from '../../../use-cases/dashboard/read-dashboard.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { getMetrics } from './get-metrics.js'

export async function dashboardRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ReadDashboard,
) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/dashboard/metrics', secure, getMetrics(service))
}
