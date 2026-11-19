import type { FastifyRequest } from 'fastify'
import type { ManageSamples } from '../../../use-cases/samples/manage-samples.js'
import { identifier, scope } from '../request-scope.js'
import { sample } from './schemas.js'

export function updateSample(service: ManageSamples) {
  return (req: FastifyRequest) =>
    service.updateSample(
      scope(req),
      identifier(req),
      sample.partial().parse(req.body),
    )
}
