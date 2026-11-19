import type { Client, Sample, Report, ReportStage, ReportKind, Prisma } from '@prisma/client'

export type ClientData = Pick<Client, 'name' | 'document' | 'email' | 'phone' | 'address'>
export type SampleData = Pick<Sample, 'identification' | 'type' | 'origin' | 'collectedAt' | 'status' | 'analyses'>
export type DraftData = Pick<Report, 'identification' | 'customerName'> & {
  kind: ReportKind
  draftData: Prisma.InputJsonObject
}
export type OriginalPdf = { storageKey: string; sha256: string; byteLength: number }
export type DraftTransition = {
  from: ReportStage
  to: ReportStage
  revision: number
  actorId: string
  action: 'EDITED' | 'SUBMITTED' | 'VALIDATED' | 'RETURNED'
  draft?: DraftData
}
export interface LaboratoryRepository {
  listClients(lab: string): Promise<Client[]>
  client(lab: string, id: string): Promise<Client | null>
  createClient(lab: string, data: ClientData): Promise<Client>
  updateClient(lab: string, id: string, data: Partial<ClientData> & { active?: boolean }): Promise<Client | null>
  listSamples(lab: string): Promise<Sample[]>
  sample(lab: string, id: string): Promise<Sample | null>
  createSample(lab: string, data: SampleData): Promise<Sample>
  updateSample(lab: string, id: string, data: Partial<SampleData> & { active?: boolean }): Promise<Sample | null>
  createDraft(lab: string, actorId: string, data: DraftData, original?: OriginalPdf): Promise<Report>
  transition(lab: string, id: string, change: DraftTransition): Promise<Report | null>
  metrics(lab: string): Promise<{ total: number; clients: number; samples: number; byStage: { stage: ReportStage; count: number }[] }>
}
