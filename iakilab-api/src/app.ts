import { reportIssuanceRoutes } from './http/controllers/report-issuance/routes.js'
import type { makeReportIssuanceUseCases } from './use-cases/_factories/make-report-issuance-use-cases.js'
import multipart from '@fastify/multipart'
import { Prisma } from '@prisma/client'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import { AppError } from './domain.js'
import type { Config } from './config.js'
import type { AuthService } from './use-cases/auth/auth-service.js'
import type { ReadReports } from './use-cases/reports/read-reports.js'
import type { PdfStorage } from './lib/pdf-storage.js'
import { authRoutes } from './http/controllers/auth/routes.js'
import { usersRoutes } from './http/controllers/users/routes.js'
import { reportsRoutes } from './http/controllers/reports/routes.js'
import { laboratoriesRoutes } from './http/controllers/laboratories/routes.js'
import { plansRoutes } from './http/controllers/plans/routes.js'
import { subscriptionsRoutes } from './http/controllers/subscriptions/routes.js'
import type { makePlatformUseCases } from './use-cases/_factories/make-platform-use-cases.js'
import { clientsRoutes } from './http/controllers/clients/routes.js'
import { serviceOrderRoutes } from './http/controllers/service-orders/routes.js'
import { samplesRoutes } from './http/controllers/samples/routes.js'
import { dashboardRoutes } from './http/controllers/dashboard/routes.js'
import { reportDraftRoutes } from './http/controllers/report-drafts/routes.js'
import type { makeLaboratoryUseCases } from './use-cases/_factories/make-laboratory-use-cases.js'
export async function buildApp(
  config: Config,
  services: {
    auth: AuthService
    reports: ReadReports
    storage: PdfStorage
    issuance?: ReturnType<typeof makeReportIssuanceUseCases>
    laboratory?: ReturnType<typeof makeLaboratoryUseCases>
    platform?: ReturnType<typeof makePlatformUseCases>
  },
  logger = false,
) {
  const app = Fastify({
    logger: logger
      ? {
          redact: [
            'req.headers.authorization',
            'req.url',
            'req.headers.cookie',
            'res.headers.set-cookie',
          ],
          level: 'info',
        }
      : false,
    bodyLimit: 65536,
    trustProxy: false,
  })
  await app.register(cookie)
  await app.register(multipart)
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { iss: 'iakilab-homolog', aud: 'iakilab-admin' },
    verify: { allowedIss: 'iakilab-homolog', allowedAud: 'iakilab-admin' },
  })
  await app.register(cors, {
    origin: config.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'no-referrer')
  })
  app.setErrorHandler((e, req, reply) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return reply.status(409).send({ code: 'DUPLICATE_RECORD' })
    if (e instanceof ZodError)
      return reply
        .status(400)
        .send({
          code: 'INVALID_REQUEST',
          message: 'Revise os campos enviados.',
        })
    if (e instanceof AppError)
      return reply.status(e.status).send({ code: e.code, message: e.code })
    const statusCode =
      e instanceof Error &&
      'statusCode' in e &&
      typeof e.statusCode === 'number'
        ? e.statusCode
        : 500
    if (statusCode === 413)
      return reply.status(413).send({ code: 'PAYLOAD_TOO_LARGE' })
    if (statusCode === 429)
      return reply.status(429).send({ code: 'RATE_LIMITED' })
    if (statusCode < 500)
      return reply.status(statusCode).send({ code: 'INVALID_REQUEST' })
    req.log.error({ event: 'INTERNAL_ERROR', requestId: req.id })
    return reply.status(500).send({ code: 'INTERNAL_ERROR' })
  })
  app.get('/health', async () => ({
    status: 'ok',
    environment: 'homologation',
  }))
  await authRoutes(app, services.auth, config)
  await usersRoutes(app, services.auth)
  await reportsRoutes(app, services.auth, services.reports, services.storage)
  if (services.issuance) await reportIssuanceRoutes(app, services.auth, services.issuance)
  if (services.laboratory) {
    await clientsRoutes(app, services.auth, services.laboratory.clients)
    await samplesRoutes(app, services.auth, services.laboratory.samples)
    if (services.laboratory.orders) await serviceOrderRoutes(app, services.auth, services.laboratory.orders)
    await dashboardRoutes(app, services.auth, services.laboratory.dashboard)
    await reportDraftRoutes(app, services.auth, services.laboratory.drafts)
  }
  if (services.platform) {
    await laboratoriesRoutes(app, services.auth, services.platform.laboratories)
    await plansRoutes(app, services.auth, services.platform.plans)
    await subscriptionsRoutes(
      app,
      services.auth,
      services.platform.subscriptions,
    )
  }
  return app
}
