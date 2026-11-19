import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageSamples } from '../../../use-cases/samples/manage-samples.js'
import { scope } from '../request-scope.js'
import { sample } from './schemas.js'

export function createSample(service: ManageSamples) {
  return async (req: FastifyRequest, reply: FastifyReply) =>
    reply
      .code(201)
      .send(await service.createSample(scope(req), sample.parse(req.body)))
}
