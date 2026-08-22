import { useCallback, useEffect, useState } from 'react'

import { ApiError, type GetToken } from './apiClient'
import {
  addTaskToWorkBlock,
  createWorkBlock,
  fetchActiveWorkBlock,
  finishWorkBlock,
  type WorkBlock,
} from './workBlocksApi'

export interface WorkBlockState {
  block: WorkBlock | null
  loading: boolean
  error: string | null
  start: (
    name: string,
    taskIds: string[],
    newTask?: { name: string; estimatedMinutes: number },
  ) => Promise<void>
  addExisting: (taskId: string) => Promise<void>
  addNew: (name: string, estimatedMinutes: number) => Promise<void>
  finish: () => Promise<void>
  refresh: () => Promise<void>
}

export function useWorkBlock(getToken: GetToken): WorkBlockState {
  const [block, setBlock] = useState<WorkBlock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { block: loaded } = await fetchActiveWorkBlock(getToken)
      setBlock(loaded)
      setError(null)
    } catch (cause) {
      console.error('[work-block] load failed', cause)
      setError(
        cause instanceof ApiError ? cause.message : 'Failed to load work block',
      )
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void load()
  }, [load])

  const mutate = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action()
        setError(null)
        await load()
      } catch (cause) {
        console.error('[work-block] mutation failed', cause)
        setError(
          cause instanceof ApiError ? cause.message : 'Something went wrong',
        )
      }
    },
    [load],
  )

  return {
    block,
    loading,
    error,
    start: useCallback(
      (
        name: string,
        taskIds: string[],
        newTask?: { name: string; estimatedMinutes: number },
      ) =>
        mutate(async () => {
          const { block: created } = await createWorkBlock(getToken, {
            name,
            taskIds,
          })
          // Sequenced here rather than in the component, where the new block's
          // id isn't available yet.
          if (newTask) await addTaskToWorkBlock(getToken, created.id, newTask)
        }),
      [getToken, mutate],
    ),
    addExisting: useCallback(
      (taskId: string) =>
        mutate(async () => {
          if (!block) return
          await addTaskToWorkBlock(getToken, block.id, { taskId })
        }),
      [getToken, mutate, block],
    ),
    addNew: useCallback(
      (name: string, estimatedMinutes: number) =>
        mutate(async () => {
          if (!block) return
          await addTaskToWorkBlock(getToken, block.id, { name, estimatedMinutes })
        }),
      [getToken, mutate, block],
    ),
    finish: useCallback(
      () =>
        mutate(async () => {
          if (!block) return
          await finishWorkBlock(getToken, block.id)
        }),
      [getToken, mutate, block],
    ),
    refresh: load,
  }
}
