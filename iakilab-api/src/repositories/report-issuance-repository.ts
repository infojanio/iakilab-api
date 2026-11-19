import type { ReportRecord } from './reports-repository.js'

export type StoredPdf = { storageKey: string; sha256: string; byteLength: number }
export type IssuanceClaim = {
  laboratoryId: string
  reportId: string
  revision: number
  attempt: string
  actorId: string
}

export interface ReportIssuanceRepository {
  claim(claim: IssuanceClaim, now: Date, expiredBefore: Date): Promise<boolean>
  complete(claim: IssuanceClaim, code: string, file: StoredPdf): Promise<boolean>
  fail(claim: IssuanceClaim): Promise<void>
  findPublishedByFilename(filename: string): Promise<ReportRecord | null>
  findPublished(code: string): Promise<ReportRecord | null>
}
