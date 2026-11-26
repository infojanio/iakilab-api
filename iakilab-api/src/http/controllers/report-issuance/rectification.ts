import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { RectifyReport } from '../../../use-cases/reports/rectify-report.js'
import { identifier, scope } from '../request-scope.js'

const body = z.object({ reason: z.string().trim().min(1).max(2000) }).strict()

export function startRectification(service: RectifyReport) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const draft = await service.start(scope(request), identifier(request), body.parse(request.body).reason)
    return reply.code(201).send(draft)
  }
}

export function rectificationHistory(service: RectifyReport) {
  return (request: FastifyRequest) => service.history(scope(request), identifier(request))
}
