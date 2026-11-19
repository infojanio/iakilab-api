import type { FastifyRequest } from 'fastify'
import type { ManagePlans } from '../../../use-cases/plans/manage-plans.js'
import { z } from 'zod'
import { id, plan } from './schemas.js'

export function updatePlan(service: ManagePlans) {
  return (req: FastifyRequest) =>
    service.savePlan(
      req.actor,
      plan.parse(req.body),
      z.object({ id }).parse(req.params).id,
    )
}
