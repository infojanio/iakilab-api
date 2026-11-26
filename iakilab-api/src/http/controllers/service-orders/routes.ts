import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ManageServiceOrders } from '../../../use-cases/service-orders/manage-service-orders.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { identifier, scope } from '../request-scope.js'

const create = z.object({ number: z.string().trim().min(1).max(200) }).strict()
const attachment = z.object({ id: z.string().uuid() }).strict()

export async function serviceOrderRoutes(app: FastifyInstance, auth: AuthService, service: ManageServiceOrders) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/service-orders', secure, req => service.list(scope(req)))
  app.post('/service-orders', secure, async (req, reply) => {
    const order = await service.create(scope(req), create.parse(req.body).number)
    return reply.code(201).send(order)
  })
  app.get('/service-orders/:id', secure, req => service.detail(scope(req), identifier(req)))
  app.post('/service-orders/:id/visit/complete', secure, req => service.completeVisit(scope(req), identifier(req)))
  app.post('/service-orders/:id/samples', secure, req =>
    service.attach(scope(req), identifier(req), 'sample', attachment.parse(req.body).id))
  app.post('/service-orders/:id/reports', secure, req =>
    service.attach(scope(req), identifier(req), 'report', attachment.parse(req.body).id))
}
