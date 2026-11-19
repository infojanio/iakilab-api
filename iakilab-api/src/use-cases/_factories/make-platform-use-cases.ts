import type { PlatformRepository } from '../../repositories/platform-repository.js'
import { ManageLaboratories } from '../laboratories/manage-laboratories.js'
import { ManagePlans } from '../plans/manage-plans.js'
import { ManageSubscriptions } from '../subscriptions/manage-subscriptions.js'

export function makePlatformUseCases(repository: PlatformRepository) {
  return {
    laboratories: new ManageLaboratories(repository),
    plans: new ManagePlans(repository),
    subscriptions: new ManageSubscriptions(repository),
  }
}
