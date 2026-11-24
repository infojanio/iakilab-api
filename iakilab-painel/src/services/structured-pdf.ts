import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createStructuredDraft, newDraftId, newSoilSample } from '../data/report-templates'
import type { DraftResult, StructuredReportDraftDTO } from '../types/report-draft'
import { validateLocalPdf } from './pdf-import'

GlobalWorkerOptions.workerSrc = workerUrl

type TextPart = { text: string; x: number; y: number; width: number }
type Line = { y: number; parts: TextPart[] }

function linesOf(parts: TextPart[]): Line[] {
  const lines: Line[] = []
  for (const part of parts.sort((a, b) => b.y - a.y)) {
    let line = lines.at(-1)
    if (!line || line.y - part.y > 4) {
      line = { y: part.y, parts: [] }
      lines.push(line)
    }
    line.parts.push(part)
  }
  return lines
}

function cell(line: Line, from = 0, to = Infinity): string {
  const parts = line.parts.filter(part => part.x >= from && part.x < to).sort((a, b) => a.x - b.x)
  return parts.map((part, i) => {
    const previous = parts[i - 1]
    const space = previous && part.x - previous.x - previous.width > 1
    return (space ? ' ' : '') + part.text
  }).join('').replace(/\s+/g, ' ').trim()
}

function value(lines: Line[], label: RegExp, from?: number, to?: number): string {
  for (const line of lines) {
    const text = cell(line, from, to)
    if (label.test(text)) return text.replace(label, '').trim()
  }
  return ''
}

function date(text: string): string {
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!parts) return ''
  const iso = [parts[3], parts[2], parts[1]].join('-')
  const parsed = new Date(iso)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(iso) ? iso : ''
}

function section(lines: Line[], start: RegExp, end: RegExp): string {
  const index = lines.findIndex(line => start.test(cell(line)))
  if (index < 0) return ''
  const body = lines.slice(index + 1)
  const last = body.findIndex(line => end.test(cell(line)))
  return body.slice(0, last < 0 ? undefined : last).map(line => cell(line)).join('\n')
}

function waterDraft(pages: Line[][]): StructuredReportDraftDTO {
  const [first] = pages
  const draft = createStructuredDraft('WATER')
  const sample = value(first, /^Identificação de Amostra:\s*/i)
  const [sampleType, coordinates] = sample.split(/\s*\/\s*(?:Vazão\s+)?coord\.\s*UTM\s*:\s*/i, 2)
  Object.assign(draft, {
    identification: value(first, /^N[°º]\s*/),
    customerName: value(first, /^Interessado:\s*/i),
    address: value(first, /^Endereço:\s*/i, 0, 270),
    municipality: value(first, /^Município:\s*/i, 270),
    document: value(first, /^CPF\s*\/\s*CNPJ:\s*/i, 0, 270),
    phone: value(first, /^Contato:\s*/i, 270),
    sampleType,
    sampleOrigin: coordinates ? 'UTM: ' + coordinates : '',
    collectionDate: date(value(first, /^Data da coleta:\s*/i)),
    entryDate: date(value(first, /^Data da entrada:\s*/i)),
    collectionAgent: value(first, /^Responsável pela coleta:\s*/i),
    normativeReference: first.filter(line => /^PRT GM|^888|^396\//i.test(cell(line, 340, 420)))
      .slice(0, 3).map(line => cell(line, 340, 420)).join(' '),
    recommendations: section(pages.flat(), /^5\.\s*Recomendações e Observações/i, /^Sistema para validação/i),
  })
  // Este leiaute coloca o número do item à esquerda e usa colunas distintas para cada grupo.
  draft.waterResults = pages.flatMap(lines => lines.flatMap((line, index): DraftResult[] => {
    const item = cell(line, 0, 50)
    const physical = /^3\.\d+$/.test(item)
    const bacterialParameter = /^4\.\d+\s*-?\s*(.+)$/.exec(cell(line, 0, 180))
    const bacterial = !!bacterialParameter
    if (!physical && !bacterial) return []
    const assayDate = date(physical ? cell(line, 200, 275) : cell(line, 180, 250))
    if (!assayDate) throw new Error('Não foi possível ler a data de um ensaio de água.')
    const previous = lines[index - 1]
    const continuation = bacterial && previous && previous.y - line.y <= 10
      && !cell(previous, 0, 315) ? previous : undefined
    const read = (from: number, to?: number) =>
      [continuation && cell(continuation, from, to), cell(line, from, to)].filter(Boolean).join(' ')
    return [{
      id: newDraftId(),
      group: physical ? 'PHYSICOCHEMICAL' : 'BACTERIOLOGICAL',
      parameter: physical ? cell(line, 50, 180) : bacterialParameter![1],
      assayDate,
      result: physical ? cell(line, 275, 340) : cell(line, 250, 315),
      reference: read(physical ? 340 : 315, 415),
      unit: read(415, 480),
      method: read(480),
    }]
  }))
  if (!draft.identification || !draft.customerName || !draft.sampleType || !draft.waterResults.some(row => row.result)) {
    throw new Error('O PDF não corresponde ao modelo reconhecido de água e efluentes.')
  }
  return draft
}

const soilColumns = [
  { start: 45, unit: 115, result: 175, end: 215 },
  { start: 215, unit: 275, result: 325, end: 375 },
  { start: 375, unit: 440, result: 495, end: 555 },
]

function soilDraft(pages: Line[][]): StructuredReportDraftDTO {
  const [first] = pages
  const draft = createStructuredDraft('SOIL')
  const methodPage = pages.find(lines => lines.some(line => /^Metodologia aplicada:/i.test(cell(line))))
  const methodIndex = methodPage?.findIndex(line => /^Metodologia aplicada:/i.test(cell(line))) ?? -1
  const technical = methodPage?.slice(methodIndex, methodIndex + 2).map(line => cell(line)).join(' ') ?? ''
  const [methodology, notes = ''] = technical.replace(/^Metodologia aplicada:\s*/i, '').split(/\s+Obs\.:\s*/i)
  Object.assign(draft, {
    customerName: value(first, /^Nome\s*:\s*/i, 0, 265),
    municipality: value(first, /^Cidade:\s*/i, 0, 265),
    requester: value(first, /^Solicitante:\s*/i),
    property: value(first, /^Propriedade:\s*/i, 0, 265),
    crop: value(first, /^Cultura:\s*/i, 265),
    entryDate: date(value(first, /^Chegada da amostra:\s*/i, 265)),
    resultSentDate: date(value(first, /^Envio de resultado:\s*/i, 265)),
    methodology,
    notes,
  })

  const codes = first.find(line => /^Cod\.\s*Anal[ií]tico:/i.test(cell(line)))
  const labels = first.find(line => /^Amostra:/i.test(cell(line)))
  const parameters = new Map<string, StructuredReportDraftDTO['soilParameters'][number]>()
  draft.soilSamples = !codes || !labels ? [] : soilColumns.flatMap(({ start, unit, result, end }) => {
    const analyticalCode = cell(codes, start, end).replace(/^Cod\.\s*Anal[ií]tico:\s*/i, '')
    if (!analyticalCode) return []
    const label = cell(labels, start, end).replace(/^Amostra:\s*/i, '')
    const depth = /\((\d+\s*(?:a|[-–])\s*\d+\s*cm)\)/i.exec(label)
    const sample = {
      ...newSoilSample(),
      analyticalCode,
      identification: depth ? label.replace(depth[0], '').replace(/\s+/g, ' ').trim() : label,
      depth: depth?.[1] ?? '',
    }
    for (const line of pages.flat()) {
      const firstColumn = soilColumns[0]
      const parameter = cell(line, firstColumn.start, firstColumn.unit) || cell(line, start, unit)
      const measurementUnit = cell(line, unit, result).replace(/μ/g, 'µ')
      if (!parameter || !/^(Un|µS\/cm|cmolc\/dm³|mg\/dm³|%|g\/kg)$/.test(measurementUnit)) continue
      const key = parameter + '|' + measurementUnit
      let definition = parameters.get(key)
      if (!definition) {
        definition = { id: newDraftId(), parameter, unit: measurementUnit, method: '', reference: '', group: 'SOIL' }
        parameters.set(key, definition)
      }
      const measured = cell(line, result, end)
      if (measured) sample.results[definition.id] = measured
    }
    return [sample]
  })
  draft.soilParameters = [...parameters.values()]
  draft.identification = draft.soilSamples.map(sample => sample.analyticalCode).join(' / ')
  if (!draft.customerName || !draft.property || !draft.soilSamples.length
      || draft.soilSamples.some(sample => !sample.identification || !Object.keys(sample.results).length)) {
    throw new Error('O PDF não corresponde ao modelo reconhecido de análise de solo.')
  }
  return draft
}

export async function readStructuredPdf(
  file: File,
  kind: 'WATER' | 'SOIL',
): Promise<StructuredReportDraftDTO> {
  await validateLocalPdf(file)
  const task = getDocument({ data: await file.arrayBuffer(), isEvalSupported: false })
  try {
    const pdf = await task.promise.catch(() => {
      throw new Error('Não foi possível abrir o PDF. Confira se o arquivo está íntegro e sem senha.')
    })
    const pages: Line[][] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const { items } = await page.getTextContent()
      pages.push(linesOf(items.flatMap(item => 'str' in item && item.str.trim() ? [{
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
      }] : [])))
      page.cleanup()
    }
    return kind === 'WATER' ? waterDraft(pages) : soilDraft(pages)
  } finally {
    await task.destroy()
  }
}
