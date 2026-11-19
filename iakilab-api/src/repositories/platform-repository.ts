export type LaboratoryInput = { name: string; slug: string; document?: string }
export type PlanInput = { name: string; price: string; users: number; reports: number; storageGB: number; active: boolean }
export type SubscriptionInput = { laboratoryId: string; planId: string; startsAt: Date; expiresAt: Date }

export interface PlatformRepository {
  createLaboratory(data: LaboratoryInput): Promise<unknown>
  savePlan(data: PlanInput, id?: string): Promise<unknown>
  createSubscription(data: SubscriptionInput): Promise<unknown>
  laboratories(): Promise<unknown[]>
  plans(): Promise<unknown[]>
  subscriptions(): Promise<unknown[]>
}
