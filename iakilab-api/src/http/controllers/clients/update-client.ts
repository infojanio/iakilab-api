import type { FastifyRequest } from 'fastify'
import type { ManageClients } from '../../../use-cases/clients/manage-clients.js'
import { identifier, scope } from '../request-scope.js'
import { client } from './schemas.js'

export function updateClient(service: ManageClients) {
  return (req: FastifyRequest) =>
    service.updateClient(
      scope(req),
      identifier(req),
      client.partial().parse(req.body),
    )
}
