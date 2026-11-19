import { z } from 'zod'

const name = z.string().trim().min(1).max(200)
export const id = z.string().uuid()
export const plan = z
  .object({
    name,
    price: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    users: z.number().int().min(0).max(2147483647),
    reports: z.number().int().min(0).max(2147483647),
    storageGB: z.number().int().min(0).max(1000000),
    active: z.boolean(),
  })
  .strict()
