import { type GamePlan } from './config'
import { request, type GetToken } from './apiClient'

export { ApiError } from './apiClient'
export type { GetToken } from './apiClient'

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
