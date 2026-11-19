import { AppError, type Actor } from '../../domain.js'
import type { PlatformRepository } from '../../repositories/platform-repository.js'

export class ReadPlatform {
  constructor(private repository: PlatformRepository) {}

  async list(actor: Actor, resource: 'laboratories' | 'plans' | 'subscriptions') {
    if (actor.role !== 'SUPER_ADMIN') throw new AppError(403, 'ROLE_NOT_ALLOWED')
    return this.repository[resource]()
  }
}
