import type { FastifyRequest } from 'fastify'
import type { ManageClients } from '../../../use-cases/clients/manage-clients.js'
import { identifier, scope } from '../request-scope.js'

export function getClient(service: ManageClients) {
  return (req: FastifyRequest) => service.client(scope(req), identifier(req))
}
