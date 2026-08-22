import { getAuth } from '@clerk/express'
import { Router, type Request, type Response } from 'express'

import { prisma } from '../db.js'
import { MissingEmailError, resolveUser } from '../users.js'

export const workBlocksRouter = Router()

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
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
 * Actual time per task: summed from every completed work session linked to it,
 * regardless of which block those sessions ran under. Blocks never partition
 * progress.
 */
async function actualMsByTask(taskIds: string[]): Promise<Map<string, number>> {
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

/**
 * For each task, the names of the *other* still-open blocks it also belongs
 * to. Powers the "Also open in:" caption.
 */
async function alsoOpenInByTask(
  taskIds: string[],
  excludeBlockId: string,
): Promise<Map<string, string[]>> {
  if (taskIds.length === 0) return new Map()

  const rows = await prisma.workBlockTask.findMany({
    where: {
      taskId: { in: taskIds },
      workBlockId: { not: excludeBlockId },
      workBlock: { endedAt: null },
    },
    include: { workBlock: { select: { name: true } } },
  })

  const map = new Map<string, string[]>()
  for (const row of rows) {
    const names = map.get(row.taskId) ?? []
    names.push(row.workBlock.name)
    map.set(row.taskId, names)
  }
  return map
}

/** Shapes a block plus its tasks the way the client expects. */
async function serializeBlock(block: {
  id: string
  name: string
  startedAt: Date
  endedAt: Date | null
}) {
  const joins = await prisma.workBlockTask.findMany({
    where: { workBlockId: block.id },
    include: { task: true },
    orderBy: { id: 'asc' },
  })

  const tasks = joins.map((join) => join.task)
  const ids = tasks.map((task) => task.id)

  const [totals, counts, alsoOpen] = await Promise.all([
    actualMsByTask(ids),
    sessionCountByTask(ids),
    alsoOpenInByTask(ids, block.id),
  ])

  return {
    id: block.id,
    name: block.name,
    startedAt: block.startedAt,
    endedAt: block.endedAt,
    tasks: tasks.map((task) => ({
      ...task,
      actualMs: totals.get(task.id) ?? 0,
      sessionCount: counts.get(task.id) ?? 0,
      alsoOpenIn: alsoOpen.get(task.id) ?? [],
    })),
  }
}

/** The block currently in progress, or null. */
workBlocksRouter.get('/api/work-blocks/active', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    if (!user.activeWorkBlockId) {
      res.json({ block: null })
      return
    }

    const block = await prisma.workBlock.findUnique({
      where: { id: user.activeWorkBlockId },
    })

    if (!block || block.userId !== user.id) {
      res.json({ block: null })
      return
    }

    res.json({ block: await serializeBlock(block) })
  } catch (error) {
    console.error('[GET /api/work-blocks/active] failed:', error)
    res.status(500).json({ error: 'Failed to load work block' })
  }
})

workBlocksRouter.post('/api/work-blocks', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const body = (req.body ?? {}) as Record<string, unknown>
    const name = body['name']
    const taskIds = body['taskIds'] ?? []

    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name must be a non-empty string' })
      return
    }

    if (!Array.isArray(taskIds) || taskIds.some((id) => typeof id !== 'string')) {
      res.status(400).json({ error: 'taskIds must be an array of task ids' })
      return
    }

    // Starting with zero tasks is explicitly valid.
    const unique = [...new Set(taskIds as string[])]

    if (unique.length > 0) {
      const found = await prisma.task.findMany({ where: { id: { in: unique } } })

      if (found.length !== unique.length) {
        res.status(404).json({ error: 'One or more tasks were not found' })
        return
      }
      if (found.some((task) => task.userId !== user.id)) {
        res.status(404).json({ error: 'One or more tasks were not found' })
        return
      }
      if (found.some((task) => task.completed)) {
        res.status(409).json({ error: 'Cannot add a completed task to a block' })
        return
      }
    }

    const block = await prisma.workBlock.create({
      data: {
        userId: user.id,
        name: name.trim(),
        startedAt: new Date(),
        tasks: { create: unique.map((taskId) => ({ taskId })) },
      },
    })

    // A new block must not inherit whatever task happened to be selected
    // before it started — that would stamp its sessions with a task the block
    // doesn't contain. The selection survives only if the block includes it.
    const keepsActiveTask =
      user.activeTaskId !== null && unique.includes(user.activeTaskId)

    // Overwriting the pointer is what "clears" the previous block. The old
    // block keeps endedAt null — unreachable, but deliberately not finished.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        activeWorkBlockId: block.id,
        ...(keepsActiveTask ? {} : { activeTaskId: null }),
      },
    })

    res.status(201).json({ block: await serializeBlock(block) })
  } catch (error) {
    console.error('[POST /api/work-blocks] failed:', error)
    res.status(500).json({ error: 'Failed to create work block' })
  }
})

/** Adds an existing task (taskId) or a brand-new one (name + estimate). */
workBlocksRouter.post('/api/work-blocks/:id/tasks', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const { id } = req.params

    const block = await prisma.workBlock.findUnique({ where: { id } })
    if (!block || block.userId !== user.id) {
      res.status(404).json({ error: 'Work block not found' })
      return
    }
    if (user.activeWorkBlockId !== block.id) {
      res.status(409).json({ error: 'Work block is not the active block' })
      return
    }

    const body = (req.body ?? {}) as Record<string, unknown>
    let taskId: string

    if (typeof body['taskId'] === 'string' && body['taskId'] !== '') {
      const task = await prisma.task.findUnique({
        where: { id: body['taskId'] },
      })

      if (!task || task.userId !== user.id) {
        res.status(404).json({ error: 'Task not found' })
        return
      }
      if (task.completed) {
        res.status(409).json({ error: 'Cannot add a completed task to a block' })
        return
      }

      taskId = task.id
    } else {
      const name = body['name']
      const estimatedMinutes = body['estimatedMinutes']

      if (typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name must be a non-empty string' })
        return
      }
      if (!isPositiveInt(estimatedMinutes)) {
        res.status(400).json({ error: 'estimatedMinutes must be a positive integer' })
        return
      }

      const created = await prisma.task.create({
        data: { userId: user.id, name: name.trim(), estimatedMinutes },
      })
      taskId = created.id
    }

    // Idempotent: re-adding a task already in this block is a no-op.
    await prisma.workBlockTask.upsert({
      where: { workBlockId_taskId: { workBlockId: block.id, taskId } },
      update: {},
      create: { workBlockId: block.id, taskId },
    })

    res.status(201).json({ block: await serializeBlock(block) })
  } catch (error) {
    console.error('[POST /api/work-blocks/:id/tasks] failed:', error)
    res.status(500).json({ error: 'Failed to add task to work block' })
  }
})

workBlocksRouter.patch('/api/work-blocks/:id/finish', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const { id } = req.params

    const block = await prisma.workBlock.findUnique({ where: { id } })
    if (!block || block.userId !== user.id) {
      res.status(404).json({ error: 'Work block not found' })
      return
    }
    if (user.activeWorkBlockId !== block.id) {
      res.status(409).json({ error: 'Work block is not the active block' })
      return
    }

    const finished = await prisma.workBlock.update({
      where: { id: block.id },
      data: { endedAt: new Date() },
    })

    // Deliberately leaves activeTaskId alone: the selected task survives.
    await prisma.user.update({
      where: { id: user.id },
      data: { activeWorkBlockId: null },
    })

    res.json({ block: { id: finished.id, name: finished.name, endedAt: finished.endedAt } })
  } catch (error) {
    console.error('[PATCH /api/work-blocks/:id/finish] failed:', error)
    res.status(500).json({ error: 'Failed to finish work block' })
  }
})
