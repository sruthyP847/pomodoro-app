import { request, type GetToken } from './apiClient'
import { type Task } from './tasksApi'

/** A task inside a block: the normal task shape plus the cross-block note. */
export interface BlockTask extends Task {
  /** Names of other still-open blocks this task also belongs to. */
  alsoOpenIn: string[]
}

export interface WorkBlock {
  id: string
  name: string
  startedAt: string
  endedAt: string | null
  tasks: BlockTask[]
}

export function fetchActiveWorkBlock(getToken: GetToken) {
  return request<{ block: WorkBlock | null }>('/api/work-blocks/active', getToken)
}

export function createWorkBlock(
  getToken: GetToken,
  input: { name: string; taskIds: string[] },
) {
  return request<{ block: WorkBlock }>('/api/work-blocks', getToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Either { taskId } for a backlog task, or { name, estimatedMinutes }. */
export function addTaskToWorkBlock(
  getToken: GetToken,
  blockId: string,
  input: { taskId: string } | { name: string; estimatedMinutes: number },
) {
  return request<{ block: WorkBlock }>(
    `/api/work-blocks/${blockId}/tasks`,
    getToken,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function finishWorkBlock(getToken: GetToken, blockId: string) {
  return request<{ block: { id: string; endedAt: string } }>(
    `/api/work-blocks/${blockId}/finish`,
    getToken,
    { method: 'PATCH' },
  )
}
