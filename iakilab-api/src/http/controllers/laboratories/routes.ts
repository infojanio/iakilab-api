import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ManageLaboratories } from '../../../use-cases/laboratories/manage-laboratories.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { listLaboratories } from './list-laboratories.js'
import { createLaboratory } from './create-laboratory.js'

export async function laboratoriesRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ManageLaboratories,
) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/laboratories', secure, listLaboratories(service))
  app.post('/laboratories', secure, createLaboratory(service))
}
