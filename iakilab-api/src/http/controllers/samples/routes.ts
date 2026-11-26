import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ManageSamples } from '../../../use-cases/samples/manage-samples.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { listSamples } from './list-samples.js'
import { getSample } from './get-sample.js'
import { createSample } from './create-sample.js'
import { updateSample } from './update-sample.js'
import { archiveSample } from './archive-sample.js'
import { inspectSample, saveSampleAnalysis, startSampleAnalysis } from './inspect-sample.js'
import { printLabels } from './print-labels.js'

export async function samplesRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ManageSamples,
) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/samples', secure, listSamples(service))
  app.get('/samples/:id', secure, getSample(service))
  app.post('/samples', secure, createSample(service))
  app.post('/samples/labels', secure, printLabels(service))
  app.post('/samples/:id/inspection', secure, inspectSample(service))
  app.post('/samples/:id/analysis/start', secure, startSampleAnalysis(service))
  app.post('/samples/:id/analysis/result', secure, saveSampleAnalysis(service))
  app.patch('/samples/:id', secure, updateSample(service))
  app.delete('/samples/:id', secure, archiveSample(service))
}
