import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ManageClients } from '../../../use-cases/clients/manage-clients.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { listClients } from './list-clients.js'
import { getClient } from './get-client.js'
import { createClient } from './create-client.js'
import { updateClient } from './update-client.js'
import { archiveClient } from './archive-client.js'

export async function clientsRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ManageClients,
) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/clients', secure, listClients(service))
  app.get('/clients/:id', secure, getClient(service))
  app.post('/clients', secure, createClient(service))
  app.patch('/clients/:id', secure, updateClient(service))
  app.delete('/clients/:id', secure, archiveClient(service))
}
