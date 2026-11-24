import { PDFDocument } from 'pdf-lib'
import type { A1CredentialStore, A1Material } from '../../lib/a1-credential-store.js'
import { AppError } from '../../domain.js'
import { requireLaboratoryAdmin, type Scope } from '../laboratory/scope.js'
import { PdfA1, type A1Config } from '../../lib/pdf-a1.js'
import type { LocalPdfStorage } from '../../lib/pdf-storage.js'
import type { ReportIssuanceRepository } from '../../repositories/report-issuance-repository.js'
import type { ReportsRepository } from '../../repositories/reports-repository.js'
import type { AuthService } from '../auth/auth-service.js'
import { IssueReport } from '../reports/issue-report.js'
import { ReadPublicReport } from '../reports/read-public-report.js'

export function makeReportIssuanceUseCases(
  auth: AuthService, reports: ReportsRepository, repository: ReportIssuanceRepository,
  storage: LocalPdfStorage, config?: ReadonlyMap<string, A1Config>, configurationInvalid = false, credentials?: A1CredentialStore,
) {
  const setups = new Map(Array.from(config ?? [], ([id, entry]) => [
    id, { publicOrigin: entry.publicOrigin, signer: new PdfA1(entry) },
  ]))
  async function resolveSigner(id: string) {
    if (credentials) {
      const material = await credentials.load(id)
      if (material) return { publicOrigin: credentials.publicOrigin, signer: {
        inspect: () => credentials.withSigner(material, signer => signer.inspect()),
        signAndVerify: (bytes: Buffer, reason: string) =>
          credentials.withSigner(material, signer => signer.signAndVerify(bytes, reason)),
      } }
    }
    if (configurationInvalid) throw new AppError(503, 'LABORATORY_SIGNER_INVALID_CONFIGURATION')
    return setups.get(id.toLowerCase())
  }
  return {
    issue: new IssueReport(auth, reports, repository, storage, resolveSigner),
    async signerStatus(scope: Scope) {
      requireLaboratoryAdmin(scope)
      const laboratoryId = await auth.tenant(scope.actor, scope.laboratoryId)
      try {
        const setup = await resolveSigner(laboratoryId.toLowerCase())
        const status = setup ? await setup.signer.inspect() : { status: 'UNAVAILABLE' as const }
        return { ...status, ...(credentials && { manageable: true }) }
      } catch (error) {
        if (error instanceof AppError && error.code === 'LABORATORY_SIGNER_INVALID_CONFIGURATION')
          return { status: 'INVALID_CONFIGURATION' as const, ...(credentials && { manageable: true }) }
        throw error
      }
    },
    async configureSigner(scope: Scope, material: A1Material) {
      requireLaboratoryAdmin(scope)
      const laboratoryId = (await auth.tenant(scope.actor, scope.laboratoryId)).toLowerCase()
      if (!credentials) throw new AppError(503, 'A1_MANAGEMENT_UNAVAILABLE')
      const status = await credentials.withSigner(material, async signer => {
        const pdf = await PDFDocument.create()
        pdf.addPage().drawText('Teste de configuracao A1 IAkiLab')
        await signer.signAndVerify(Buffer.from(await pdf.save()))
        return signer.inspect()
      })
      await credentials.save(laboratoryId, material)
      return { ...status, manageable: true }
    },
    publicReport: new ReadPublicReport(repository, storage),
  }
}
