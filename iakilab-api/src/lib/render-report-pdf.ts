import { resolve } from 'node:path'
import PDFKit from 'pdfkit'
import { PDFDocument, PDFName, PDFSignature, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import type { ReportRecord } from '../repositories/reports-repository.js'
import { AppError } from '../domain.js'

const contactFields = {
  customerName: 'Cliente', document: 'Documento', requester: 'Solicitante',
  email: 'E-mail', phone: 'Telefone', address: 'Endereço', municipality: 'Município',
  property: 'Propriedade', crop: 'Cultura', sampleType: 'Tipo da amostra', sampleOrigin: 'Origem',
  sampleMunicipality: 'Município da coleta', latitude: 'Latitude', longitude: 'Longitude',
  collectionDate: 'Data da coleta', collectionTime: 'Hora da coleta', collectionAgent: 'Agente de coleta',
  rainCondition: 'Chuva na coleta', entryDate: 'Recebimento', arrivalTime: 'Hora do recebimento',
  resultSentDate: 'Envio dos resultados', classification: 'Classificação',
  normativeReference: 'Referência normativa', methodology: 'Metodologia', recommendations: 'Recomendações',
  technicianName: 'Responsável técnico', technicianRegistration: 'Registro profissional', notes: 'Observações',
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function renderStructured(report: ReportRecord, laboratoryName: string): Promise<Buffer> {
  const snapshot = object(report.draftData)
  const document = new PDFKit({ size: 'A4', margin: 48, font: resolve('assets/fonts/DejaVuSans.ttf') })
  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
  })
  function text(label: string, value: unknown) {
    if (typeof value === 'string' && value.trim()) document.fontSize(10).text(label + ': ' + value)
  }
  document.fontSize(19).text(laboratoryName)
  document.fontSize(14).text(report.kind === 'SOIL' ? 'Laudo de análise de solo' : 'Laudo de análise de água e efluentes')
  text('Identificação', report.identification)
  for (const [key, label] of Object.entries(contactFields)) text(label, snapshot[key])
  document.moveDown().fontSize(13).text('Resultados')
  if (report.kind === 'SOIL') {
    const parameters = Array.isArray(snapshot.soilParameters) ? snapshot.soilParameters.map(object) : []
    for (const sample of Array.isArray(snapshot.soilSamples) ? snapshot.soilSamples.map(object) : []) {
      document.moveDown()
      text('Amostra', sample.identification)
      text('Código analítico', sample.analyticalCode)
      text('Profundidade', sample.depth)
      const results = object(sample.results)
      const definitions = new Map(parameters.map(parameter => [parameter.id, parameter]))
      for (const [id, value] of Object.entries(results)) {
        if (typeof value !== 'string' || !value.trim()) continue
        writeResult({ ...(definitions.get(id) ?? { parameter: id }), result: value })
      }
    }
  } else {
    for (const result of Array.isArray(snapshot.waterResults) ? snapshot.waterResults.map(object) : []) {
      writeResult(result)
    }
  }
  function writeResult(result: Record<string, unknown>) {
    document.moveDown(0.4)
    text('Parâmetro', result.parameter)
    text('Grupo', result.group)
    text('Resultado', result.result)
    text('Unidade', result.unit)
    text('Método', result.method)
    text('Referência', result.reference)
    text('Data do ensaio', result.assayDate)
  }
  document.end()
  return finished
}

export async function renderReportPdf(report: ReportRecord, laboratoryName: string, verificationUrl: URL, original?: Buffer) {
  const bytes = original ?? await renderStructured(report, laboratoryName)
  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(bytes)
  } catch {
    throw new AppError(422, 'REPORT_PDF_CANNOT_BE_RENDERED')
  }
  if (original && pdf.getForm().getFields().some(field => field instanceof PDFSignature && field.acroField.dict.has(PDFName.of('V')))) {
    throw new AppError(422, 'ALREADY_SIGNED_ORIGINAL')
  }
  // Verification gets its own page so an imported report never has text covered by a QR.
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const image = await pdf.embedPng(await QRCode.toBuffer(verificationUrl.href, { width: 320 }))
  page.drawText('Verificação do laudo', { x: 48, y: 770, size: 20, font, color: rgb(0.05, 0.25, 0.25) })
  page.drawText('Aponte a câmera para o QR Code ou informe o código no portal.', { x: 48, y: 730, size: 11, font })
  page.drawImage(image, { x: 48, y: 470, width: 226, height: 226 })
  page.drawText(verificationUrl.searchParams.get('code')!, { x: 48, y: 450, size: 10, font })
  return Buffer.from(await pdf.save())
}
