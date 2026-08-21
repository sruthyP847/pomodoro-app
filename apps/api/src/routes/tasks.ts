import { getAuth } from '@clerk/express'
import { Router, type Request, type Response } from 'express'

import { prisma } from '../db.js'
import { MissingEmailError, resolveUser } from '../users.js'

export const tasksRouter = Router()

interface TaskFields {
  name: string
  estimatedMinutes: number
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/**
 * Validates task fields. With `partial`, only the keys present are checked —
 * each against exactly the same rule as on create.
 */
function parseTaskBody(
  body: unknown,
  partial: boolean,
): Partial<TaskFields> | string {
  if (body === null || typeof body !== 'object') return 'Body must be an object'

  const input = body as Record<string, unknown>
  const parsed: Partial<TaskFields> = {}

  if (!partial || 'name' in input) {
    if (typeof input['name'] !== 'string' || input['name'].trim() === '') {
      return 'name must be a non-empty string'
    }
    parsed.name = input['name'].trim()
  }

  if (!partial || 'estimatedMinutes' in input) {
    if (!isPositiveInt(input['estimatedMinutes'])) {
      return 'estimatedMinutes must be a positive integer'
    }
    parsed.estimatedMinutes = input['estimatedMinutes']
  }

  if (partial && Object.keys(parsed).length === 0) {
    return 'No editable fields supplied'
  }

  return parsed
}

/** Resolves the caller, or writes the appropriate error response. */
async function requireUser(req: Request, res: Response) {
  const { userId } = getAuth(req)

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  try {
    const { user } = await resolveUser(userId)
    return user
  } catch (error) {
    if (error instanceof MissingEmailError) {
      res.status(422).json({ error: error.message })
      return null
    }
    throw error
  }
}

/**
 * Time actually spent per task: the sum of activeDurationMs over completed
 * work sessions. Computed live on every read, never stored on the Task.
 */
async function actualMsByTask(
  taskIds: string[],
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map()

  const rows = await prisma.session.groupBy({
    by: ['taskId'],
    where: { taskId: { in: taskIds }, type: 'work', completed: true },
    _sum: { activeDurationMs: true },
  })

  return new Map(
    rows.map((row) => [row.taskId as string, row._sum.activeDurationMs ?? 0]),
  )
}

/**
 * Linked sessions of any type per task. Drives the delete rule, so it counts
 * everything linked rather than only the work sessions that add to actualMs.
 */
async function sessionCountByTask(
  taskIds: string[],
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map()

  const rows = await prisma.session.groupBy({
    by: ['taskId'],
    where: { taskId: { in: taskIds } },
    _count: { _all: true },
  })

  return new Map(rows.map((row) => [row.taskId as string, row._count._all]))
}

/** Lists the caller's incomplete tasks with live actual-time totals. */
tasksRouter.get('/api/tasks', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const tasks = await prisma.task.findMany({
      where: { userId: user.id, completed: false },
      orderBy: { createdAt: 'asc' },
    })

    const ids = tasks.map((task) => task.id)
    const [totals, counts] = await Promise.all([
      actualMsByTask(ids),
      sessionCountByTask(ids),
    ])

    res.json({
      tasks: tasks.map((task) => ({
        ...task,
        actualMs: totals.get(task.id) ?? 0,
        sessionCount: counts.get(task.id) ?? 0,
      })),
      activeTaskId: user.activeTaskId,
    })
  } catch (error) {
    console.error('[GET /api/tasks] failed:', error)
    res.status(500).json({ error: 'Failed to load tasks' })
  }
})

tasksRouter.post('/api/tasks', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const parsed = parseTaskBody(req.body, false)
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed })
      return
    }

    const task = await prisma.task.create({
      data: { ...(parsed as TaskFields), userId: user.id },
    })

    res.status(201).json({ ...task, actualMs: 0, sessionCount: 0 })
  } catch (error) {
    console.error('[POST /api/tasks] failed:', error)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

tasksRouter.patch('/api/tasks/:id', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const { id } = req.params

    const existing = await prisma.task.findUnique({ where: { id } })
    // Same response whether it's missing or someone else's — don't leak which.
    if (!existing || existing.userId !== user.id) {
      res.status(404).json({ error: 'Task not found' })
      return
    }

    const parsed = parseTaskBody(req.body, true)
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed })
      return
    }

    const task = await prisma.task.update({ where: { id }, data: parsed })
    const totals = await actualMsByTask([task.id])
    const counts = await sessionCountByTask([task.id])

    res.json({
      ...task,
      actualMs: totals.get(task.id) ?? 0,
      sessionCount: counts.get(task.id) ?? 0,
    })
  } catch (error) {
    console.error('[PATCH /api/tasks/:id] failed:', error)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

tasksRouter.patch('/api/tasks/:id/complete', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const { id } = req.params

    const existing = await prisma.task.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      res.status(404).json({ error: 'Task not found' })
      return
    }

    const task = await prisma.task.update({
      where: { id },
      data: { completed: true },
    })

    // A completed task can't stay active.
    const wasActive = user.activeTaskId === id
    if (wasActive) {
      await prisma.user.update({
        where: { id: user.id },
        data: { activeTaskId: null },
      })
    }

    res.json({ task, activeTaskId: wasActive ? null : user.activeTaskId })
  } catch (error) {
    console.error('[PATCH /api/tasks/:id/complete] failed:', error)
    res.status(500).json({ error: 'Failed to complete task' })
  }
})

tasksRouter.delete('/api/tasks/:id', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const { id } = req.params

    const existing = await prisma.task.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      res.status(404).json({ error: 'Task not found' })
      return
    }

    // Any linked session at all makes this destructive — refuse.
    const linked = await prisma.session.count({ where: { taskId: id } })
    if (linked > 0) {
      res.status(409).json({
        error: `Cannot delete a task with recorded sessions (${linked}).`,
      })
      return
    }

    if (user.activeTaskId === id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { activeTaskId: null },
      })
    }

    await prisma.task.delete({ where: { id } })
    res.status(204).end()
  } catch (error) {
    console.error('[DELETE /api/tasks/:id] failed:', error)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

/** Sets or clears the task the timer counts toward. */
tasksRouter.patch('/api/me/active-task', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const body = req.body as Record<string, unknown> | null

    if (body === null || typeof body !== 'object' || !('taskId' in body)) {
      res.status(400).json({ error: 'taskId is required (null to clear)' })
      return
    }

    const { taskId } = body

    // Explicit null clears the active task — a plain session.
    if (taskId === null) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { activeTaskId: null },
      })
      res.json({ activeTaskId: updated.activeTaskId })
      return
    }

    if (typeof taskId !== 'string' || taskId === '') {
      res.status(400).json({ error: 'taskId must be a non-empty string or null' })
      return
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task || task.userId !== user.id) {
      res.status(404).json({ error: 'Task not found' })
      return
    }

    if (task.completed) {
      res.status(409).json({ error: 'Cannot activate a completed task' })
      return
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { activeTaskId: task.id },
    })

    res.json({ activeTaskId: updated.activeTaskId })
  } catch (error) {
    console.error('[PATCH /api/me/active-task] failed:', error)
    res.status(500).json({ error: 'Failed to set active task' })
  }
})
