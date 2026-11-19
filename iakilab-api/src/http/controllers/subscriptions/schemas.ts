import { z } from 'zod'

export const id = z.string().uuid()
export const date = z.iso.date().transform((value) => new Date(value))
