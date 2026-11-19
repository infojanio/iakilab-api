import type { FastifyRequest } from 'fastify'
import type { ManageSamples } from '../../../use-cases/samples/manage-samples.js'
import { identifier, scope } from '../request-scope.js'

export function getSample(service: ManageSamples) {
  return (req: FastifyRequest) => service.sample(scope(req), identifier(req))
}
