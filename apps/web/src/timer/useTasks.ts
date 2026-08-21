import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, type GetToken } from './apiClient'
import {
  completeTask,
  createTask,
  deleteTask,
  fetchTasks,
  setActiveTask,
  updateTask,
  type Task,
  type TaskInput,
} from './tasksApi'

export interface TasksState {
  tasks: Task[]
  activeTask: Task | null
  loading: boolean
  error: string | null
  create: (input: TaskInput) => Promise<void>
  update: (id: string, input: Partial<TaskInput>) => Promise<void>
  complete: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  activate: (id: string | null) => Promise<void>
  refresh: () => Promise<void>
}

export function useTasks(getToken: GetToken): TasksState {
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { tasks: loaded, activeTaskId } = await fetchTasks(getToken)
      setTasks(loaded)
      setActiveId(activeTaskId)
      setError(null)
    } catch (cause) {
      console.error('[tasks] load failed', cause)
      setError(cause instanceof ApiError ? cause.message : 'Failed to load tasks')
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
        console.error('[tasks] mutation failed', cause)
        setError(
          cause instanceof ApiError ? cause.message : 'Something went wrong',
        )
      }
    },
    [load],
  )

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeId) ?? null,
    [tasks, activeId],
  )

  return {
    tasks,
    activeTask,
    loading,
    error,
    create: useCallback(
      (input: TaskInput) => mutate(() => createTask(getToken, input)),
      [getToken, mutate],
    ),
    update: useCallback(
      (id: string, input: Partial<TaskInput>) =>
        mutate(() => updateTask(getToken, id, input)),
      [getToken, mutate],
    ),
    complete: useCallback(
      (id: string) => mutate(() => completeTask(getToken, id)),
      [getToken, mutate],
    ),
    remove: useCallback(
      (id: string) => mutate(() => deleteTask(getToken, id)),
      [getToken, mutate],
    ),
    activate: useCallback(
      (id: string | null) => mutate(() => setActiveTask(getToken, id)),
      [getToken, mutate],
    ),
    refresh: load,
  }
}
