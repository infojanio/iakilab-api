import { request, setAccessToken } from './api'
import type { User } from '../types/report'

let refreshInProgress: Promise<User> | undefined

async function loadSession(path: string, body?: string): Promise<User> {
  const session = await request<{ accessToken: string }>(path, { method: 'POST', body })
  if (!session.accessToken) throw new Error('Token ausente.')
  setAccessToken(session.accessToken)
  try {
    const user = await request<User>('/users/me')
    if (!user?.id || !['SUPER_ADMIN', 'ADMIN', 'ANALISTA'].includes(user.role) || (user.role !== 'SUPER_ADMIN' && !user.laboratoryId)) {
      throw new Error('Sessão inválida ou sem laboratório autorizado.')
    }
    return user
  } catch (error) {
    setAccessToken(null)
    throw error
  }
}

export const authService = {
  login(email: string, password: string) {
    return loadSession('/sessions', JSON.stringify({ email, password }))
  },
  refresh() {
    // StrictMode may mount effects twice. A refresh cookie can only be used once.
    refreshInProgress ??= loadSession('/sessions/refresh').finally(() => { refreshInProgress = undefined })
    return refreshInProgress
  },
  async logout() {
    try { await request('/sessions/logout', { method: 'POST' }) }
    finally { setAccessToken(null) }
  },
  recover(email: string) {
    return request('/password/forgot', { method: 'POST', body: JSON.stringify({ email }) })
  },
}
