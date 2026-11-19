import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { getLaboratoryProfile } from './get-laboratory-profile.js'
import { listUsers } from './list-users.js'
import { getProfile } from './get-profile.js'

export async function usersRoutes(app: FastifyInstance, auth: AuthService) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/laboratories/me', secure, getLaboratoryProfile(auth))
  app.get('/users', secure, listUsers(auth))
  app.get('/users/me', secure, getProfile())
}
