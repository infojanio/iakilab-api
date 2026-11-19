import { AppError, type Actor } from '../../domain.js'
export type Scope = { actor: Actor; laboratoryId?: string }

export function requireLaboratoryAdmin(scope: Scope) {
  if (scope.actor.role === 'ANALISTA')
    throw new AppError(403, 'ROLE_NOT_ALLOWED')
}
export function requireRecord<T>(record: T | null): T {
  if (!record) throw new AppError(404, 'RECORD_NOT_FOUND')
  return record
}
