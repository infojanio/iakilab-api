import type { Actor } from '../../domain.js'
import type {
  PlanInput,
  PlatformRepository,
} from '../../repositories/platform-repository.js'
import { requirePlatformAdmin } from '../platform/require-platform-admin.js'

export class ManagePlans {
  constructor(
    private repository: Pick<PlatformRepository, 'plans' | 'savePlan'>,
  ) {}

  list(actor: Actor) {
    requirePlatformAdmin(actor)
    return this.repository.plans()
  }

  savePlan(actor: Actor, data: PlanInput, id?: string) {
    requirePlatformAdmin(actor)
    return this.repository.savePlan(data, id)
  }
}
