import type { PrismaClient } from '@prisma/client'
import type { PlatformRepository } from '../platform-repository.js'

export class PrismaPlatformRepository implements PlatformRepository {
  constructor(private db: PrismaClient) {}

  async laboratories() {
    const rows = await this.db.laboratory.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: { subscriptions: { orderBy: [{ expiresAt: 'desc' }, { id: 'desc' }], take: 1 } },
    })
    return rows.map(lab => {
      const subscription = lab.subscriptions[0]
      return {
        id: lab.id, name: lab.name, document: lab.document ?? '', responsible: '',
        active: lab.active, planId: subscription?.planId ?? '',
        subscriptionStatus: subscription?.status ?? 'UNCONFIGURED',
      }
    })
  }

  async plans() {
    const rows = await this.db.plan.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] })
    return rows.map(plan => ({
      id: plan.id, name: plan.name, price: Number(plan.price), users: plan.maxUsers,
      reports: plan.maxReports, storageGB: Number(plan.storageBytes) / 1e9,
      features: [], active: plan.active,
    }))
  }

  subscriptions() {
    return this.db.subscription.findMany({
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      select: { id: true, laboratoryId: true, planId: true, status: true, startsAt: true, expiresAt: true },
    })
  }
}
