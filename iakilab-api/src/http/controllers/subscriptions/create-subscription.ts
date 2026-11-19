import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageSubscriptions } from '../../../use-cases/subscriptions/manage-subscriptions.js'
import { z } from 'zod'
import { id, date } from './schemas.js'

export function createSubscription(service: ManageSubscriptions) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const data = z
      .object({ laboratoryId: id, planId: id, startsAt: date, expiresAt: date })
      .strict()
      .parse(req.body)
    return reply
      .code(201)
      .send(await service.createSubscription(req.actor, data))
  }
}
