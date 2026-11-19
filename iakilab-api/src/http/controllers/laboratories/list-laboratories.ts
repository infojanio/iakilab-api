import type { FastifyRequest } from 'fastify'
import type { ManageLaboratories } from '../../../use-cases/laboratories/manage-laboratories.js'

export function listLaboratories(service: ManageLaboratories) {
  return (req: FastifyRequest) => service.list(req.actor)
}
