import { request, type GetToken } from '../timer/apiClient'

/** A work session as the dashboard endpoint returns it. */
export interface DashboardSession {
  id: string
  /** ISO string; all local-time interpretation happens on the client. */
  startedAt: string
  activeDurationMs: number
  completed: boolean
  taskId: string | null
  taskName: string | null
}

export function fetchDashboardSessions(getToken: GetToken) {
  return request<{ sessions: DashboardSession[] }>(
    '/api/dashboard/sessions',
    getToken,
  )
}
