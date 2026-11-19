import { AppError, type Actor } from '../../domain.js'
import type {
  SubscriptionInput,
  PlatformRepository,
} from '../../repositories/platform-repository.js'
import { requirePlatformAdmin } from '../platform/require-platform-admin.js'

export class ManageSubscriptions {
  constructor(
    private repository: Pick<
      PlatformRepository,
      'subscriptions' | 'createSubscription'
    >,
  ) {}

  list(actor: Actor) {
    requirePlatformAdmin(actor)
    return this.repository.subscriptions()
  }

  createSubscription(actor: Actor, data: SubscriptionInput) {
    requirePlatformAdmin(actor)
    if (data.expiresAt <= data.startsAt)
      throw new AppError(400, 'INVALID_SUBSCRIPTION_PERIOD')
    return this.repository.createSubscription(data)
  }
}
