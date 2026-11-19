import type { FastifyRequest } from 'fastify'
import type { ManageSubscriptions } from '../../../use-cases/subscriptions/manage-subscriptions.js'

export function listSubscriptions(service: ManageSubscriptions) {
  return (req: FastifyRequest) => service.list(req.actor)
}
