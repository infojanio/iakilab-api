import { z } from 'zod'

export const name = z.string().trim().min(1).max(200)
