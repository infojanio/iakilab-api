import { Prisma, type PrismaClient } from '@prisma/client'
import { AppError } from '../../domain.js'
import type { LaboratoryInput, PlanInput, PlatformRepository, SubscriptionInput } from '../platform-repository.js'

export class PrismaPlatformRepository implements PlatformRepository {
  constructor(private db: PrismaClient) {}

  createLaboratory(data: LaboratoryInput) {
    return this.db.laboratory.create({ data })
  }

  async savePlan(input: PlanInput, id?: string) {
    const data = {
      name: input.name, price: input.price, maxUsers: input.users, maxReports: input.reports,
      storageBytes: BigInt(input.storageGB) * 1_000_000_000n, active: input.active,
    }
    try {
      const plan = id ? await this.db.plan.update({ where: { id }, data }) : await this.db.plan.create({ data })
      return { id: plan.id }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new AppError(404, 'PLAN_NOT_FOUND')
      throw error
    }
  }

  async createSubscription(data: SubscriptionInput) {
    try {
      return await this.db.$transaction(async db => {
        const lab = await db.laboratory.findUnique({ where: { id: data.laboratoryId, active: true } })
        const plan = await db.plan.findUnique({ where: { id: data.planId, active: true } })
        if (!lab || !plan) throw new AppError(404, 'ACTIVE_LABORATORY_OR_PLAN_NOT_FOUND')
        const overlap = await db.subscription.findFirst({ where: {
          laboratoryId: data.laboratoryId, status: 'ACTIVE',
          startsAt: { lt: data.expiresAt }, expiresAt: { gt: data.startsAt },
        } })
        if (overlap) throw new AppError(409, 'SUBSCRIPTION_PERIOD_OVERLAP')
        return db.subscription.create({ data: { ...data, status: 'ACTIVE' } })
      }, { isolationLevel: 'Serializable' })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(409, 'SUBSCRIPTION_CHANGED_CONCURRENTLY')
      throw error
    }
  }

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
