import type { FastifyRequest } from 'fastify'
import { z } from 'zod'

const uuid = z.string().uuid()
const laboratoryQuery = z.object({ laboratoryId: uuid.optional() }).strict()
const resourceParams = z.object({ id: uuid })

export function requestedLaboratory(query: unknown) {
  return laboratoryQuery.parse(query).laboratoryId
}

export function scope(request: FastifyRequest) {
  return {
    actor: request.actor,
    laboratoryId: requestedLaboratory(request.query),
  }
}

export function identifier(request: FastifyRequest) {
  return resourceParams.parse(request.params).id
}
