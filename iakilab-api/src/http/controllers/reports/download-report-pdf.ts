import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ReadReports } from '../../../use-cases/reports/read-reports.js'
import type { PdfStorage } from '../../../lib/pdf-storage.js'
import { z } from 'zod'

export function downloadReportPdf(
  auth: AuthService,
  reports: ReadReports,
  storage: PdfStorage,
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const q = z
      .object({
        laboratoryId: z.string().uuid().optional(),
        variant: z.enum(['signed', 'original']).optional(),
      })
      .strict()
      .parse(req.query)
    const lab = await auth.tenant(req.actor, q.laboratoryId)
    const f = await reports.pdf(lab, id, q.variant)
    const bytes = await storage.read(f.storageKey, f.sha256, f.byteLength)
    req.log.info({
      event: 'PDF_READ',
      userId: req.actor.user.id,
      laboratoryId: lab,
      reportId: id,
      fileId: f.id,
    })
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `inline; filename="laudo-${id}.pdf"`)
      .type('application/pdf')
      .send(bytes)
  }
}
