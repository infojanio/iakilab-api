import { request } from './api'
import type { SampleDTO } from '../types/report'

export type ServiceOrder = { id: string; number: string; visitCompletedAt: string | null }
export type OrderReport = { id: string; identification: string; stage: string }
export type WorkQueue = 'reception' | 'analysis' | 'recollection' | 'review'
export type ServiceOrderDetail = ServiceOrder & {
 samples: SampleDTO[]
 reports: OrderReport[]
 pending: Record<WorkQueue, string[]>
}

function orderRequest<T>(path: string, laboratoryId?: string, send = false, payload?: object) {
 const query = laboratoryId ? '?' + new URLSearchParams({ laboratoryId }) : ''
 return request<T>('/service-orders' + path + query, {
  method: send ? 'POST' : 'GET', body: payload && JSON.stringify(payload),
 })
}

export const ordersService = {
 list: (lab?: string) => orderRequest<ServiceOrder[]>('', lab),
 create: (number: string, lab?: string) => orderRequest<ServiceOrder>('', lab, true, { number }),
 detail: (id: string, lab?: string) => orderRequest<ServiceOrderDetail>('/' + encodeURIComponent(id), lab),
 complete: (id: string, lab?: string) => orderRequest<ServiceOrderDetail>('/' + encodeURIComponent(id) + '/visit/complete', lab, true),
 attach: (orderId: string, kind: 'samples' | 'reports', id: string, lab?: string) =>
  orderRequest<ServiceOrderDetail>('/' + encodeURIComponent(orderId) + '/' + kind, lab, true, { id }),
}
