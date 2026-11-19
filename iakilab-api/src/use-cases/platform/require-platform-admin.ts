import { AppError, type Actor } from '../../domain.js'

export function requirePlatformAdmin(actor: Actor) {
  if (actor.role !== 'SUPER_ADMIN') throw new AppError(403, 'ROLE_NOT_ALLOWED')
}
