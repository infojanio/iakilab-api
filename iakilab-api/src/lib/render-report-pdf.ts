import { resolve } from 'node:path'
import PDFKit from 'pdfkit'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import type { ReportRecord } from '../repositories/reports-repository.js'
import { hasPdfSignature } from './pdf-signature-fields.js'
import { AppError } from '../domain.js'

const ink = '#183638'
const teal = '#14595B'
const margin = 42
type ReportLayout = Pick<ReportRecord, 'kind' | 'identification'> & { draftData: unknown }

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(object) : []
}

function value(input: unknown) {
  return typeof input === 'string' ? input.trim() : ''
}

function shown(input: unknown, fallback = 'Não informado') {
  return value(input) || fallback
}

function date(input: unknown) {
  const text = value(input)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  return iso ? iso[3] + '/' + iso[2] + '/' + iso[1] : text
}

async function renderStructured(
  report: ReportLayout,
  laboratoryName: string,
): Promise<Buffer> {
  const draft = object(report.draftData)
  const document = new PDFKit({
    size: 'A4',
    margin,
    font: resolve('assets/fonts/DejaVuSans.ttf'),
  })
  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
  })
  const width = document.page.width - 2 * margin
  const bottom = () => document.page.height - margin

  function header() {
    if (laboratoryName.trim().toLowerCase() === 'labmoura') {
      const y = document.y
      const left = margin + 94
      const identityWidth = width - 94
      document.image(resolve('assets/brands/labmoura.jpeg'), margin, y, { fit: [84, 42] })
      document.fillColor(teal).fontSize(10).text(
        'LAB MOURA ANÁLISE DE ÁGUA, EFLUENTES E CONSULTORIA AMBIENTAL LTDA',
        left, y, { width: identityWidth },
      )
      for (const line of [
        'Rua Antônio Moura, nº 42 · Povoado Coité · Porto Franco – MA',
        'CEP 65970-000 · CNPJ 07.650.440/0001-33 · (62) 99329-4573',
        'albani@labmoura.com.br · www.labmoura.com.br',
      ]) document.fillColor(ink).fontSize(8).text(line, left, document.y, { width: identityWidth })
      document.x = margin
      document.y = Math.max(document.y, y + 48)
      document.moveDown(0.55)
      return
    }
    document.fillColor(teal).fontSize(13).text(laboratoryName)
    document.moveDown(0.55)
  }

  function paragraph(text: string, size = 9) {
    document
      .fillColor(ink)
      .fontSize(size)
      .text(text, margin, document.y, { width })
  }

  function ensure(height: number) {
    if (document.y + height > bottom()) document.addPage()
  }

  function heading(text: string) {
    ensure(55)
    document.moveDown(0.55)
    document
      .fillColor(teal)
      .fontSize(12)
      .text(text, margin, document.y, { width })
    document.moveDown(0.35)
  }

  function fields(rows: [string, unknown][]) {
    for (const [label, content] of rows)
      paragraph(label + ': ' + shown(content))
  }

  function table(headers: string[], proportions: number[], rows: string[][]) {
    const widths = proportions.map((part) => part * width)
    const padding = 5
    document.fontSize(8)
    const measure = (text: string, column: number) =>
      document.heightOfString(text || ' ', {
        width: widths[column] - 2 * padding,
      })
    const height = (cells: string[]) =>
      Math.ceil(Math.max(...cells.map(measure))) + 2 * padding

    function draw(cells: string[], rowHeight: number, label: boolean) {
      const y = document.y
      let x = margin
      cells.forEach((cell, column) => {
        document
          .rect(x, y, widths[column], rowHeight)
          .fillAndStroke(label ? '#DFEEED' : '#FFFFFF', '#B9D0D0')
        document
          .fillColor(ink)
          .fontSize(8)
          .text(cell, x + padding, y + padding, {
            width: widths[column] - 2 * padding,
          })
        x += widths[column]
      })
      document.x = margin
      document.y = y + rowHeight
    }

    const headerHeight = height(headers)
    ensure(headerHeight + 25)
    draw(headers, headerHeight, true)
    for (const row of rows) {
      let remaining = row
      do {
        if (document.y + 25 > bottom()) {
          document.addPage()
          document.fontSize(8)
          draw(headers, headerHeight, true)
        }
        const available = bottom() - document.y - 2 * padding - 1
        const cells = remaining.map((cell, column) => {
          if (measure(cell, column) <= available) return cell
          let low = 1
          let high = cell.length
          while (low < high) {
            const middle = Math.ceil((low + high) / 2)
            if (measure(cell.slice(0, middle), column) <= available)
              low = middle
            else high = middle - 1
          }
          const boundary = cell.lastIndexOf(' ', low)
          return cell.slice(0, boundary > low / 2 ? boundary : low)
        })
        draw(cells, height(cells), false)
        remaining = remaining.map((cell, column) =>
          cell.slice(cells[column].length).trimStart(),
        )
        if (remaining.some(Boolean)) {
          document.addPage()
          document.fontSize(8)
          draw(headers, headerHeight, true)
        }
      } while (remaining.some(Boolean))
    }
    document.moveDown(0.5)
  }

  const identification = shown(report.identification, 'A definir')
  header()
  if (report.kind === 'SOIL') {
    const parameters = records(draft.soilParameters)
    const samples = records(draft.soilSamples)
    for (let first = 0; first < Math.max(samples.length, 1); first += 3) {
      if (first > 0) {
        document.addPage()
        header()
      }
      const group = samples.slice(first, first + 3)
      heading('ANÁLISE DE SOLO · ' + identification)
      fields([
        ['Cliente', draft.customerName],
        ['CPF / CNPJ', draft.document],
        ['Propriedade', draft.property],
        ['Município', draft.municipality],
        ['Solicitante', draft.requester],
        ['Cultura', draft.crop],
        ['Chegada das amostras', date(draft.entryDate)],
        ['Envio dos resultados', date(draft.resultSentDate)],
      ])
      if (!group.length) continue
      heading(
        'Grupo de amostras ' +
          (first / 3 + 1) +
          ' de ' +
          Math.ceil(samples.length / 3),
      )
      group.forEach((sample, index) =>
        fields([
          ['Amostra ' + (first + index + 1), sample.identification],
          ['Código analítico', sample.analyticalCode],
          ['Profundidade', sample.depth],
        ]),
      )
      const definitions = new Map(
        parameters.map((parameter) => [value(parameter.id), parameter]),
      )
      const results = group.map((sample) => object(sample.results))
      for (const result of results) {
        for (const id of Object.keys(result)) {
          if (!definitions.has(id)) definitions.set(id, { parameter: id })
        }
      }
      table(
        [
          'Parâmetro',
          'Unidade',
          ...group.map((_, i) => 'Amostra ' + (first + i + 1)),
        ],
        [0.31, 0.15, ...group.map(() => 0.54 / group.length)],
        [...definitions].map(([id, parameter]) => [
          shown(parameter.parameter, id),
          shown(parameter.unit, '—'),
          ...results.map((result) => shown(result[id], '—')),
        ]),
      )
    }
  } else {
    heading('RELATÓRIO DE ENSAIO Nº ' + identification)
    heading('1. Identificação do cliente')
    fields([
      ['Interessado', draft.customerName],
      ['CPF / CNPJ', draft.document],
      ['Endereço', draft.address],
      ['Município', draft.municipality],
      ['Solicitante', draft.requester],
      [
        'Contato',
        [draft.phone, draft.email].map(value).filter(Boolean).join(' · '),
      ],
    ])
    heading('2. Informações de amostragem')
    fields([
      ['Identificação da amostra', draft.sampleType],
      ['Local', draft.sampleOrigin],
      ['Município da coleta', draft.sampleMunicipality],
      [
        'Data / hora da coleta',
        [date(draft.collectionDate), value(draft.collectionTime)]
          .filter(Boolean)
          .join(' · '),
      ],
      [
        'Latitude / longitude',
        [draft.latitude, draft.longitude]
          .map(value)
          .filter(Boolean)
          .join(' / '),
      ],
      [
        'Recebimento',
        [date(draft.entryDate), value(draft.arrivalTime)]
          .filter(Boolean)
          .join(' · '),
      ],
      ['Coletor', draft.collectionAgent],
      ['Chuva durante a coleta', draft.rainCondition],
      ['Referência normativa', draft.normativeReference],
      ['Enquadramento', draft.classification],
    ])
    const results = records(draft.waterResults)
    function waterTable(title: string, rows: Record<string, unknown>[]) {
      heading(title)
      if (!rows.length) {
        paragraph('Nenhum ensaio selecionado para este grupo.')
        return
      }
      table(
        [
          'Parâmetro',
          'Resultado',
          'Data do ensaio',
          'Unidade',
          'Referência / VMP',
          'Método',
        ],
        [0.22, 0.13, 0.13, 0.12, 0.18, 0.22],
        rows.map((row) => [
          shown(row.parameter),
          shown(row.result, '—'),
          date(row.assayDate) || '—',
          shown(row.unit, '—'),
          shown(row.reference, 'Não definido'),
          shown(row.method, '—'),
        ]),
      )
    }
    waterTable(
      '3. Ensaios físico-químicos',
      results.filter((row) => row.group === 'PHYSICOCHEMICAL'),
    )
    waterTable(
      '4. Ensaios bacteriológicos',
      results.filter((row) => row.group === 'BACTERIOLOGICAL'),
    )
    const other = results.filter(
      (row) =>
        row.group !== 'PHYSICOCHEMICAL' && row.group !== 'BACTERIOLOGICAL',
    )
    if (other.length) waterTable('Outros ensaios', other)
  }

  heading('Metodologia, recomendações e observações')
  fields([
    ['Metodologia', draft.methodology],
    ['Recomendações', draft.recommendations],
    ['Observações', draft.notes],
  ])
  heading('Responsabilidade técnica')
  fields([
    ['Responsável técnico', draft.technicianName],
    ['Registro profissional', draft.technicianRegistration],
    ['Data de emissão informada', date(draft.issuedDate)],
  ])
  document.end()
  return finished
}

export async function renderReportPreview(report: ReportLayout, laboratoryName: string) {
  const pdf = await PDFDocument.load(await renderStructured(report, laboratoryName))
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  for (const page of pdf.getPages()) {
    page.drawText('PRÉVIA PARA CONFERÊNCIA · SEM EMISSÃO OU ASSINATURA', {
      x: margin, y: page.getHeight() - 25, size: 8, font, color: rgb(0.4, 0.25, 0.1),
    })
  }
  return Buffer.from(await pdf.save())
}

export async function renderReportPdf(
  report: ReportRecord,
  laboratoryName: string,
  verificationUrl: URL,
  original?: Buffer,
) {
  const bytes = original ?? (await renderStructured(report, laboratoryName))
  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch {
    throw new AppError(422, 'REPORT_PDF_CANNOT_BE_RENDERED')
  }
  if (original && hasPdfSignature(pdf)) {
    throw new AppError(422, 'ALREADY_SIGNED_ORIGINAL')
  }
  // Verification gets its own page so an imported report never has text covered by a QR.
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const image = await pdf.embedPng(
    await QRCode.toBuffer(verificationUrl.href, { width: 320 }),
  )
  page.drawText('Verificação do laudo', {
    x: 48,
    y: 770,
    size: 20,
    font,
    color: rgb(0.05, 0.25, 0.25),
  })
  page.drawText(
    'Aponte a câmera para o QR Code ou informe o código no portal.',
    { x: 48, y: 730, size: 11, font },
  )
  page.drawImage(image, { x: 48, y: 470, width: 226, height: 226 })
  page.drawText(verificationUrl.searchParams.get('code')!, {
    x: 48,
    y: 450,
    size: 10,
    font,
  })
  return Buffer.from(await pdf.save({ updateFieldAppearances: false }))
}
