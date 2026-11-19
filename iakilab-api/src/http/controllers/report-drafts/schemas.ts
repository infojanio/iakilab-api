import { z } from 'zod'

export const required = z.string().trim().min(1).max(200)
export const text = z.string().max(10000)
const result = z
  .object({
    id: required,
    parameter: required,
    unit: z.string().max(60),
    method: text,
    reference: text,
    group: z.enum(['PHYSICOCHEMICAL', 'BACTERIOLOGICAL', 'SOIL']),
  })
  .strict()
export const draft = z
  .object({
    reportKind: z.enum(['WATER', 'SOIL']),
    templateVersion: z.literal('1'),
    identification: required,
    customerName: required,
    waterResults: z
      .array(
        result.extend({
          result: text,
          assayDate: z.union([z.literal(''), z.iso.date()]),
        }),
      )
      .max(300)
      .optional(),
    soilParameters: z.array(result).max(300).optional(),
    soilSamples: z
      .array(
        z
          .object({
            id: required,
            analyticalCode: text,
            identification: text,
            depth: text,
            results: z.record(required, text),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    document: text.optional(),
    address: text.optional(),
    phone: text.optional(),
    email: text.optional(),
    technicianName: text.optional(),
    sampleOrigin: text.optional(),
    sampleType: text.optional(),
    entryDate: text.optional(),
    collectionDate: text.optional(),
    collectionTime: text.optional(),
    collectionAgent: text.optional(),
    notes: text.optional(),
    municipality: text.optional(),
    requester: text.optional(),
    property: text.optional(),
    crop: text.optional(),
    resultSentDate: text.optional(),
    issuedDate: text.optional(),
    sampleMunicipality: text.optional(),
    latitude: text.optional(),
    longitude: text.optional(),
    arrivalTime: text.optional(),
    rainCondition: text.optional(),
    normativeReference: text.optional(),
    classification: text.optional(),
    methodology: text.optional(),
    recommendations: text.optional(),
    technicianRegistration: text.optional(),
  })
  .strict()
export const revision = z.object({ revision: z.number().int().min(1) }).strict()
export function draftData(body: unknown) {
  const data = draft.parse(body)
  return {
    identification: data.identification,
    customerName: data.customerName,
    kind: data.reportKind,
    draftData: data,
  }
}
