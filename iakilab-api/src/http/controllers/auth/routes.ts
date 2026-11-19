import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { Config } from '../../../config.js'
import {
  sessionCookie,
  sessionOptions,
  sessionResponse,
} from './session-cookie.js'
import { authenticate } from './authenticate.js'
import { refresh } from './refresh.js'
import { logout } from './logout.js'
import { forgotPassword } from './forgot-password.js'
import { resetPassword } from './reset-password.js'

export async function authRoutes(
  app: FastifyInstance,
  auth: AuthService,
  config: Config,
) {
  const cookie = sessionCookie(config)
  const send = sessionResponse(cookie)
  const options = sessionOptions(config)
  app.post('/sessions', options, authenticate(auth, send))
  app.post('/sessions/refresh', options, refresh(auth, send))
  app.post('/sessions/logout', options, logout(auth, cookie))
  app.post('/password/forgot', options, forgotPassword(auth))
  app.post('/password/reset', options, resetPassword(auth))
}
