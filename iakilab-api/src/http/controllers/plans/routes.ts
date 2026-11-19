import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ManagePlans } from '../../../use-cases/plans/manage-plans.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { listPlans } from './list-plans.js'
import { createPlan } from './create-plan.js'
import { updatePlan } from './update-plan.js'

export async function plansRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ManagePlans,
) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/plans', secure, listPlans(service))
  app.post('/plans', secure, createPlan(service))
  app.patch('/plans/:id', secure, updatePlan(service))
}
