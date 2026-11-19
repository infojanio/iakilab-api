import { z } from 'zod'

const required = z.string().trim().min(1).max(200)
export const sample = z
  .object({
    identification: required,
    type: required,
    origin: required,
    collectedAt: z
      .union([z.iso.date(), z.iso.datetime({ offset: true })])
      .transform((value) => new Date(value)),
    status: required,
    analyses: z.array(required).max(100),
  })
  .strict()
