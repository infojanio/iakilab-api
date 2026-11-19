import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageLaboratories } from '../../../use-cases/laboratories/manage-laboratories.js'
import { z } from 'zod'
import { name } from './schemas.js'

export function createLaboratory(service: ManageLaboratories) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const data = z
      .object({
        name,
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(80),
        document: z.string().trim().min(1).max(32).optional(),
      })
      .strict()
      .parse(req.body)
    return reply.code(201).send(await service.createLaboratory(req.actor, data))
  }
}
