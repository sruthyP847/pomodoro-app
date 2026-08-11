import { useCallback, useEffect, useMemo, useState } from 'react'

import { type GamePlan } from './config'
import {
  ApiError,
  createGamePlan,
  deleteGamePlan,
  fetchGamePlans,
  setActiveGamePlan,
  updateGamePlan,
  type GamePlanInput,
  type GetToken,
} from './gamePlansApi'

export interface GamePlansState {
  plans: GamePlan[]
  activePlan: GamePlan | null
  loading: boolean
  error: string | null
  create: (input: GamePlanInput) => Promise<void>
  update: (id: string, input: Partial<GamePlanInput>) => Promise<void>
  remove: (id: string) => Promise<void>
  activate: (id: string) => Promise<void>
  clearError: () => void
}

export function useGamePlans(getToken: GetToken): GamePlansState {
  const [plans, setPlans] = useState<GamePlan[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { plans: loaded, activeGamePlanId } = await fetchGamePlans(getToken)
      setPlans(loaded)
      setActiveId(activeGamePlanId)
      setError(null)
    } catch (cause) {
      console.error('[game-plans] load failed', cause)
      setError(cause instanceof ApiError ? cause.message : 'Failed to load plans')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void load()
  }, [load])

  /** Runs a mutation, surfacing its message and refreshing on success. */
  const mutate = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action()
        setError(null)
        await load()
      } catch (cause) {
        console.error('[game-plans] mutation failed', cause)
        setError(
          cause instanceof ApiError ? cause.message : 'Something went wrong',
        )
      }
    },
    [load],
  )

  const create = useCallback(
    (input: GamePlanInput) => mutate(() => createGamePlan(getToken, input)),
    [getToken, mutate],
  )

  const update = useCallback(
    (id: string, input: Partial<GamePlanInput>) =>
      mutate(() => updateGamePlan(getToken, id, input)),
    [getToken, mutate],
  )

  const remove = useCallback(
    (id: string) => mutate(() => deleteGamePlan(getToken, id)),
    [getToken, mutate],
  )

  const activate = useCallback(
    (id: string) => mutate(() => setActiveGamePlan(getToken, id)),
    [getToken, mutate],
  )

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activeId) ?? null,
    [plans, activeId],
  )

  return {
    plans,
    activePlan,
    loading,
    error,
    create,
    update,
    remove,
    activate,
    clearError: useCallback(() => setError(null), []),
  }
}
