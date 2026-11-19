import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Config } from '../../../config.js'
import { AppError, type Actor } from '../../../domain.js'

export function sessionCookie(config: Config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSecure ? ('none' as const) : ('lax' as const),
    path: '/sessions',
    maxAge: 7 * 86400,
  }
}

export type SessionCookie = ReturnType<typeof sessionCookie>

export function sessionOptions(config: Config) {
  return {
    preHandler: async (request: FastifyRequest) => {
      if (
        !request.headers.origin ||
        !config.origins.includes(request.headers.origin)
      ) {
        throw new AppError(403, 'ORIGIN_NOT_ALLOWED')
      }
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }
}

export function sessionResponse(cookie: SessionCookie) {
  return async (
    reply: FastifyReply,
    result: { actor: Actor; refreshToken: string },
  ) => {
    const accessToken = await reply.jwtSign(
      {
        sub: result.actor.user.id,
        sid: result.actor.sessionId,
        type: 'access',
      },
      { sign: { expiresIn: '15m' } },
    )
    reply.setCookie('iakilab_refresh', result.refreshToken, cookie)
    return { accessToken }
  }
}

export type SessionResponse = ReturnType<typeof sessionResponse>
