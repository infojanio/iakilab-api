import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageSamples } from '../../../use-cases/samples/manage-samples.js'
import { identifier, scope } from '../request-scope.js'

export function archiveSample(service: ManageSamples) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await service.archiveSample(scope(req), identifier(req))
    return reply.code(204).send()
  }
}
