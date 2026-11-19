import type { FastifyRequest } from 'fastify'
import type { ReadDashboard } from '../../../use-cases/dashboard/read-dashboard.js'
import { scope } from '../request-scope.js'

export function getMetrics(service: ReadDashboard) {
  return (req: FastifyRequest) => service.metrics(scope(req))
}
