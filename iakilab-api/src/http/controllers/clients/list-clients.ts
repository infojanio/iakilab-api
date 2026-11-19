import type { FastifyRequest } from 'fastify'
import type { ManageClients } from '../../../use-cases/clients/manage-clients.js'
import { scope } from '../request-scope.js'

export function listClients(service: ManageClients) {
  return (req: FastifyRequest) => service.listClients(scope(req))
}
