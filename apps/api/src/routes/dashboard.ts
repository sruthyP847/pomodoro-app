import { getAuth } from '@clerk/express'
import { Router } from 'express'

import { prisma } from '../db.js'
import { MissingEmailError, resolveUser } from '../users.js'

export const dashboardRouter = Router()

/**
 * Eight days rather than seven: wide enough that whatever local week the
 * client computes is fully covered, whichever timezone it is in. All week
 * boundaries, bucketing and totals are the client's job.
 */
const WINDOW_DAYS = 8

dashboardRouter.get('/api/dashboard/sessions', async (req, res) => {
  const { userId } = getAuth(req)

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const { user } = await resolveUser(userId)

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const sessions = await prisma.session.findMany({
      // Focus time only — breaks never count toward these stats.
      where: { userId: user.id, type: 'work', startedAt: { gte: since } },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        startedAt: true,
        activeDurationMs: true,
        completed: true,
        taskId: true,
        task: { select: { name: true } },
      },
    })

    res.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        activeDurationMs: session.activeDurationMs,
        completed: session.completed,
        taskId: session.taskId,
        taskName: session.task?.name ?? null,
      })),
    })
  } catch (error) {
    if (error instanceof MissingEmailError) {
      res.status(422).json({ error: error.message })
      return
    }

    console.error('[GET /api/dashboard/sessions] failed:', error)
    res.status(500).json({ error: 'Failed to load dashboard sessions' })
  }
})
