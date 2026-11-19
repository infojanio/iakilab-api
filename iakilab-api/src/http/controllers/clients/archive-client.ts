import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageClients } from '../../../use-cases/clients/manage-clients.js'
import { identifier, scope } from '../request-scope.js'

export function archiveClient(service: ManageClients) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await service.archiveClient(scope(req), identifier(req))
    return reply.code(204).send()
  }
}
