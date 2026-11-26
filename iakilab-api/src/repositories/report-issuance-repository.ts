import type { Report } from '@prisma/client'
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
  fail(claim: IssuanceClaim, code: string): Promise<void>
  findPublishedByFilename(filename: string): Promise<ReportRecord | null>
  issuerNames(ids: string[]): Promise<{ id: string; name: string }[]>
  series(laboratoryId: string, rootId: string, publishedOnly?: boolean): Promise<ReportRecord[]>
  createRectification(report: ReportRecord, rootIdentification: string, reason: string, actor: { id: string; name: string }): Promise<Report>
  findPublished(code: string): Promise<ReportRecord | null>
}
