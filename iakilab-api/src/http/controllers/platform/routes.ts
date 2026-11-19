import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ReadPlatform } from '../../../use-cases/platform/read-platform.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'

const name = z.string().trim().min(1).max(200)
const id = z.string().uuid()
const plan = z.object({
  name, price: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  users: z.number().int().min(0).max(2147483647),
  reports: z.number().int().min(0).max(2147483647),
  storageGB: z.number().int().min(0).max(1000000),
  active: z.boolean(),
}).strict()
const date = z.iso.date().transform(value => new Date(value))

export async function platformRoutes(app: FastifyInstance, auth: AuthService, service: ReadPlatform) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/laboratories', secure, req => service.list(req.actor, 'laboratories'))
  app.get('/plans', secure, req => service.list(req.actor, 'plans'))
  app.get('/subscriptions', secure, req => service.list(req.actor, 'subscriptions'))
  app.post('/laboratories', secure, async (req, reply) => {
    const data = z.object({
      name, slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
      document: z.string().trim().min(1).max(32).optional(),
    }).strict().parse(req.body)
    return reply.code(201).send(await service.createLaboratory(req.actor, data))
  })
  app.post('/plans', secure, async (req, reply) =>
    reply.code(201).send(await service.savePlan(req.actor, plan.parse(req.body))))
  app.patch('/plans/:id', secure, req =>
    service.savePlan(req.actor, plan.parse(req.body), z.object({ id }).parse(req.params).id))
  app.post('/subscriptions', secure, async (req, reply) => {
    const data = z.object({ laboratoryId: id, planId: id, startsAt: date, expiresAt: date }).strict().parse(req.body)
    return reply.code(201).send(await service.createSubscription(req.actor, data))
  })
}
