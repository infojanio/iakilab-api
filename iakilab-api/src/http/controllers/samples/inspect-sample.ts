import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ManageSamples } from '../../../use-cases/samples/manage-samples.js'
import { identifier, scope } from '../request-scope.js'

const inspection = z.object({
  decision: z.enum(['ACCEPTED', 'ACCEPTED_WITH_RESERVATION', 'REJECTED']),
  condition: z.string().trim().min(1).max(2000),
  reason: z.string().trim().max(2000).optional(),
}).strict().refine(value => value.decision === 'ACCEPTED' || Boolean(value.reason))

export function inspectSample(service: ManageSamples) {
  return (request: FastifyRequest) =>
    service.receive(scope(request), identifier(request), inspection.parse(request.body))
}

const analysis = z.object({ result: z.string().trim().min(1).max(10000) }).strict()

export function startSampleAnalysis(service: ManageSamples) {
  return (request: FastifyRequest) => service.startAnalysis(scope(request), identifier(request))
}

export function saveSampleAnalysis(service: ManageSamples) {
  return (request: FastifyRequest) =>
    service.saveAnalysisResult(scope(request), identifier(request), analysis.parse(request.body).result)
}
