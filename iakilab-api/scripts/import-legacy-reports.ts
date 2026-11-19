import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { z } from 'zod'
import { loadConfig } from '../src/config.js'
import { token } from '../src/lib/crypto.js'
import { PdfA1 } from '../src/lib/pdf-a1.js'
import { LocalPdfStorage } from '../src/lib/pdf-storage.js'
import { prisma } from '../src/lib/prisma.js'

const optionalText = z.string().max(10000).nullish()
const legacyData = z.object({
  document: optionalText, address: optionalText, phone: optionalText, email: optionalText,
  technicianName: optionalText, sampleOrigin: optionalText, sampleType: optionalText,
  entryDate: optionalText, collectionDate: optionalText, collectionTime: optionalText,
  collectionAgent: optionalText, notes: optionalText,
  analysisResults: z.json().optional(),
}).strict()
const manifestSchema = z.object({
  laboratoryId: z.string().uuid(),
  reports: z.array(z.object({
    id: z.string().uuid(),
    identification: z.string().trim().min(1).max(200).nullish(),
    customerName: z.string().trim().max(200).nullish(),
    data: legacyData.optional(),
    createdAt: z.iso.datetime({ offset: true }),
    pdf: z.string().min(1),
    legacyPdfFilename: z.string().min(5).max(255).regex(/^[^\/\\\u0000-\u001f]+\.pdf$/i).optional(),
  }).strict()),
}).strict()

async function main() {
  const [, , manifestPath, mode = '--check'] = process.argv
  if (!manifestPath || !['--check', '--apply'].includes(mode)) {
    throw new Error('Usage: import-legacy-reports.ts <manifest.json> [--check|--apply]')
  }
  const config = loadConfig()
  const trustRoot = process.env.LEGACY_A1_TRUST_ROOT || config.a1?.trustRoot
  if (!trustRoot) throw new Error('Configure LEGACY_A1_TRUST_ROOT')
  const verifier = new PdfA1({ python: process.env.A1_PYTHON ?? 'python3', trustRoot })
  const storage = new LocalPdfStorage(config.storageRoot)
  const root = await realpath(dirname(resolve(manifestPath)))
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
  const laboratory = await prisma.laboratory.findUnique({ where: { id: manifest.laboratoryId, active: true } })
  if (!laboratory) throw new Error('Active laboratory not found')
  let rejected = 0
  for (const entry of manifest.reports) {
    try {
      const source = await realpath(resolve(root, entry.pdf))
      if (!source.startsWith(root + sep)) throw new Error('File outside manifest directory')
      const info = await stat(source)
      if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('Invalid PDF file size')
      const bytes = await readFile(source)
      if (bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF')
      await verifier.verify(bytes)
      if (mode === '--apply') {
        const existing = await prisma.report.findUnique({
          where: { legacyPublicId: entry.id },
          include: { versions: { orderBy: { number: 'desc' }, take: 1, include: { files: true } } },
        })
        const identification = entry.identification ?? entry.id
        const customerName = entry.customerName ?? ''
        const snapshot = { ...entry.data, identification, customerName }
        const date = new Date(entry.createdAt)
        if (existing) {
          const file = existing.versions[0]?.files.find(value => value.kind === 'SIGNED')
          if (!file || existing.laboratoryId !== laboratory.id || existing.identification !== identification ||
              existing.customerName !== customerName || existing.createdAt.getTime() !== date.getTime() ||
              (existing.legacyPdfFilename ?? undefined) !== entry.legacyPdfFilename ||
              !(await storage.read(file.storageKey, file.sha256, file.byteLength)).equals(bytes)) {
            throw new Error('Existing record differs from manifest')
          }
        } else {
          const file = await storage.savePdf(laboratory.id, bytes)
          await prisma.$transaction(async tx => {
            const report = await tx.report.create({ data: {
              identification, customerName, laboratoryId: laboratory.id, createdAt: date, legacyPublicId: entry.id,
              legacyPdfFilename: entry.legacyPdfFilename, publicCode: token(), kind: 'PDF_UPLOAD',
              stage: 'ISSUED', draftData: snapshot,
            } })
            const version = await tx.reportVersion.create({ data: {
              reportId: report.id, laboratoryId: laboratory.id, number: 1, snapshot, issuedAt: date,
              signatureStatus: 'VERIFIED', signatureVerifiedAt: new Date(), signedSha256: file.sha256,
            } })
            await tx.reportFile.create({ data: {
              versionId: version.id, laboratoryId: laboratory.id, kind: 'SIGNED', storageKey: file.storageKey,
              sha256: file.sha256, byteLength: file.byteLength,
            } })
          })
        }
      }
      console.log(entry.id, mode === '--apply' ? 'IMPORTED_OR_ALREADY_PRESENT' : 'SIGNATURE_VERIFIED')
    } catch {
      rejected++
      console.error(entry.id, 'REJECTED_CHECK_SIGNATURE_STORAGE_OR_CONFLICT')
    }
  }
  if (rejected) process.exitCode = 1
}

main().catch(() => {
  console.error('Legacy import failed. Check configuration and manifest.')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
