import { AppError, type Actor } from '../../domain.js'
import type { LaboratoryInput, PlanInput, PlatformRepository, SubscriptionInput } from '../../repositories/platform-repository.js'

export class ReadPlatform {
  constructor(private repository: PlatformRepository) {}

  private requireAdmin(actor: Actor) {
    if (actor.role !== 'SUPER_ADMIN') throw new AppError(403, 'ROLE_NOT_ALLOWED')
  }

  async list(actor: Actor, resource: 'laboratories' | 'plans' | 'subscriptions') {
    this.requireAdmin(actor)
    return this.repository[resource]()
  }

  createLaboratory(actor: Actor, data: LaboratoryInput) {
    this.requireAdmin(actor)
    return this.repository.createLaboratory(data)
  }

  savePlan(actor: Actor, data: PlanInput, id?: string) {
    this.requireAdmin(actor)
    return this.repository.savePlan(data, id)
  }

  createSubscription(actor: Actor, data: SubscriptionInput) {
    this.requireAdmin(actor)
    if (data.expiresAt <= data.startsAt) throw new AppError(400, 'INVALID_SUBSCRIPTION_PERIOD')
    return this.repository.createSubscription(data)
  }
}
