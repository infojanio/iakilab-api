import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManagePlans } from '../../../use-cases/plans/manage-plans.js'
import { plan } from './schemas.js'

export function createPlan(service: ManagePlans) {
  return async (req: FastifyRequest, reply: FastifyReply) =>
    reply
      .code(201)
      .send(await service.savePlan(req.actor, plan.parse(req.body)))
}
