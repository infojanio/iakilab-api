import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ManageSubscriptions } from '../../../use-cases/subscriptions/manage-subscriptions.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { listSubscriptions } from './list-subscriptions.js'
import { createSubscription } from './create-subscription.js'

export async function subscriptionsRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ManageSubscriptions,
) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/subscriptions', secure, listSubscriptions(service))
  app.post('/subscriptions', secure, createSubscription(service))
}
