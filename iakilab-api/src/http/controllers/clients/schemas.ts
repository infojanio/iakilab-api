import { z } from 'zod'

const required = z.string().trim().min(1).max(200)
export const client = z
  .object({
    name: required,
    document: z.string().max(32),
    email: z.union([z.literal(''), z.string().email().max(254)]),
    phone: z.string().max(40),
    address: z.string().max(500),
  })
  .strict()
