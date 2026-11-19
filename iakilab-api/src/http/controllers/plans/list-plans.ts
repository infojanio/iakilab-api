import type { FastifyRequest } from 'fastify'
import type { ManagePlans } from '../../../use-cases/plans/manage-plans.js'

export function listPlans(service: ManagePlans) {
  return (req: FastifyRequest) => service.list(req.actor)
}
