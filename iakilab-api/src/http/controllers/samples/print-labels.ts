import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ManageSamples } from '../../../use-cases/samples/manage-samples.js'
import { scope } from '../request-scope.js'

const body = z.object({
  ids: z.array(z.string().uuid().transform(id => id.toLowerCase()))
    .min(1)
    .refine(ids => new Set(ids).size === ids.length),
}).strict()

export function printLabels(service: ManageSamples) {
  return (request: FastifyRequest) =>
    service.labels(scope(request), body.parse(request.body).ids)
}
