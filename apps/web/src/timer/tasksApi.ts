import { request, type GetToken } from './apiClient'

/** A task as the API returns it. actualMs is summed live, never stored. */
export interface Task {
  id: string
  name: string
  estimatedMinutes: number
  completed: boolean
  createdAt: string
  actualMs: number
  /** Linked sessions of any type — drives whether deletion is allowed. */
  sessionCount: number
}

export interface TasksResponse {
  tasks: Task[]
  activeTaskId: string | null
}

export interface TaskInput {
  name: string
  estimatedMinutes: number
}

export function fetchTasks(getToken: GetToken) {
  return request<TasksResponse>('/api/tasks', getToken)
}

export function createTask(getToken: GetToken, input: TaskInput) {
  return request<Task>('/api/tasks', getToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTask(
  getToken: GetToken,
  id: string,
  input: Partial<TaskInput>,
) {
  return request<Task>(`/api/tasks/${id}`, getToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function completeTask(getToken: GetToken, id: string) {
  return request<{ activeTaskId: string | null }>(
    `/api/tasks/${id}/complete`,
    getToken,
    { method: 'PATCH' },
  )
}

export function deleteTask(getToken: GetToken, id: string) {
  return request<void>(`/api/tasks/${id}`, getToken, { method: 'DELETE' })
}

/** Pass null to clear the active task (a plain session). */
export function setActiveTask(getToken: GetToken, taskId: string | null) {
  return request<{ activeTaskId: string | null }>(
    '/api/me/active-task',
    getToken,
    { method: 'PATCH', body: JSON.stringify({ taskId }) },
  )
}
