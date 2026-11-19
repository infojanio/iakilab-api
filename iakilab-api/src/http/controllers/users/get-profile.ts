import type { FastifyRequest } from 'fastify'

export function getProfile() {
  return async (req: FastifyRequest) => ({
    id: req.actor.user.id,
    name: req.actor.user.name,
    email: req.actor.user.email,
    role: req.actor.role,
    laboratoryId: req.actor.laboratoryId ?? undefined,
    laboratoryName: req.actor.laboratoryName,
  })
}
