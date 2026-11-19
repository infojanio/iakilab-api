import type { Actor } from '../../domain.js'
import type {
  LaboratoryInput,
  PlatformRepository,
} from '../../repositories/platform-repository.js'
import { requirePlatformAdmin } from '../platform/require-platform-admin.js'

export class ManageLaboratories {
  constructor(
    private repository: Pick<
      PlatformRepository,
      'laboratories' | 'createLaboratory'
    >,
  ) {}

  list(actor: Actor) {
    requirePlatformAdmin(actor)
    return this.repository.laboratories()
  }

  createLaboratory(actor: Actor, data: LaboratoryInput) {
    requirePlatformAdmin(actor)
    return this.repository.createLaboratory(data)
  }
}
