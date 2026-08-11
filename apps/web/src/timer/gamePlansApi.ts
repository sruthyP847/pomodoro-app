import { type GamePlan } from './config'

export type GetToken = () => Promise<string | null>

export interface GamePlansResponse {
  plans: GamePlan[]
  activeGamePlanId: string | null
}

export interface GamePlanInput {
  name: string
  workDurationMs: number
  breakDurationMs: number
  longBreakDurationMs: number
  sessionsBeforeLongBreak: number
}

/** Error carrying the API's message so the UI can show something useful. */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(
  path: string,
  getToken: GetToken,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken()

  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      body !== null && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${response.status})`

    throw new ApiError(message, response.status)
  }

  return body as T
}

export function fetchGamePlans(getToken: GetToken) {
  return request<GamePlansResponse>('/api/game-plans', getToken)
}

export function createGamePlan(getToken: GetToken, input: GamePlanInput) {
  return request<GamePlan>('/api/game-plans', getToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateGamePlan(
  getToken: GetToken,
  id: string,
  input: Partial<GamePlanInput>,
) {
  return request<GamePlan>(`/api/game-plans/${id}`, getToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteGamePlan(getToken: GetToken, id: string) {
  return request<void>(`/api/game-plans/${id}`, getToken, { method: 'DELETE' })
}

export function setActiveGamePlan(getToken: GetToken, gamePlanId: string) {
  return request<{ activeGamePlanId: string }>(
    '/api/me/active-game-plan',
    getToken,
    { method: 'PATCH', body: JSON.stringify({ gamePlanId }) },
  )
}
