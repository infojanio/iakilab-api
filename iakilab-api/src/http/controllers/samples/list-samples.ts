import type { FastifyRequest } from 'fastify'
import type { ManageSamples } from '../../../use-cases/samples/manage-samples.js'
import { scope } from '../request-scope.js'

export function listSamples(service: ManageSamples) {
  return (req: FastifyRequest) => service.listSamples(scope(req))
}
