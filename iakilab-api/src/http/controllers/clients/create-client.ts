import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageClients } from '../../../use-cases/clients/manage-clients.js'
import { scope } from '../request-scope.js'
import { client } from './schemas.js'

export function createClient(service: ManageClients) {
  return async (req: FastifyRequest, reply: FastifyReply) =>
    reply
      .code(201)
      .send(await service.createClient(scope(req), client.parse(req.body)))
}
