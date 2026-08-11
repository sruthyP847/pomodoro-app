import { getAuth } from '@clerk/express'
import { Router, type Request, type Response } from 'express'

import { prisma } from '../db.js'
import { MissingEmailError, resolveUser } from '../users.js'

export const gamePlansRouter = Router()

interface PlanFields {
  name: string
  workDurationMs: number
  breakDurationMs: number
  longBreakDurationMs: number
  sessionsBeforeLongBreak: number
}

const DURATION_FIELDS = [
  'workDurationMs',
  'breakDurationMs',
  'longBreakDurationMs',
] as const

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/**
 * Validates plan fields. With `partial`, only the keys present are checked —
 * each against exactly the same rule as on create.
 */
function parsePlanBody(
  body: unknown,
  partial: boolean,
): Partial<PlanFields> | string {
  if (body === null || typeof body !== 'object') return 'Body must be an object'

  const input = body as Record<string, unknown>
  const parsed: Partial<PlanFields> = {}

  if (!partial || 'name' in input) {
    if (typeof input['name'] !== 'string' || input['name'].trim() === '') {
      return 'name must be a non-empty string'
    }
    parsed.name = input['name'].trim()
  }

  for (const field of DURATION_FIELDS) {
    if (!partial || field in input) {
      if (!isPositiveInt(input[field])) {
        return `${field} must be a positive integer number of milliseconds`
      }
      parsed[field] = input[field]
    }
  }

  if (!partial || 'sessionsBeforeLongBreak' in input) {
    if (!isPositiveInt(input['sessionsBeforeLongBreak'])) {
      return 'sessionsBeforeLongBreak must be a positive integer'
    }
    parsed.sessionsBeforeLongBreak = input['sessionsBeforeLongBreak']
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

/** Lists the caller's plans and which one is active. */
gamePlansRouter.get('/api/game-plans', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const plans = await prisma.gamePlan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ plans, activeGamePlanId: user.activeGamePlanId })
  } catch (error) {
    console.error('[GET /api/game-plans] failed:', error)
    res.status(500).json({ error: 'Failed to load game plans' })
  }
})

gamePlansRouter.post('/api/game-plans', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const parsed = parsePlanBody(req.body, false)
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed })
      return
    }

    const plan = await prisma.gamePlan.create({
      data: { ...(parsed as PlanFields), userId: user.id },
    })

    res.status(201).json(plan)
  } catch (error) {
    console.error('[POST /api/game-plans] failed:', error)
    res.status(500).json({ error: 'Failed to create game plan' })
  }
})

gamePlansRouter.patch('/api/game-plans/:id', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const { id } = req.params

    const existing = await prisma.gamePlan.findUnique({ where: { id } })
    // Same response whether it's missing or someone else's — don't leak which.
    if (!existing || existing.userId !== user.id) {
      res.status(404).json({ error: 'Game plan not found' })
      return
    }

    const parsed = parsePlanBody(req.body, true)
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed })
      return
    }

    const plan = await prisma.gamePlan.update({ where: { id }, data: parsed })
    res.json(plan)
  } catch (error) {
    console.error('[PATCH /api/game-plans/:id] failed:', error)
    res.status(500).json({ error: 'Failed to update game plan' })
  }
})

gamePlansRouter.delete('/api/game-plans/:id', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const { id } = req.params

    const existing = await prisma.gamePlan.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      res.status(404).json({ error: 'Game plan not found' })
      return
    }

    if (user.activeGamePlanId === id) {
      res.status(409).json({
        error: 'Cannot delete the active game plan. Switch to another first.',
      })
      return
    }

    const total = await prisma.gamePlan.count({ where: { userId: user.id } })
    if (total <= 1) {
      res.status(409).json({
        error: 'Cannot delete your only game plan.',
      })
      return
    }

    await prisma.gamePlan.delete({ where: { id } })
    res.status(204).end()
  } catch (error) {
    console.error('[DELETE /api/game-plans/:id] failed:', error)
    res.status(500).json({ error: 'Failed to delete game plan' })
  }
})

/** Sets which of the caller's plans the timer runs on. */
gamePlansRouter.patch('/api/me/active-game-plan', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return

    const body = req.body as Record<string, unknown> | null
    const gamePlanId = body?.['gamePlanId']

    if (typeof gamePlanId !== 'string' || gamePlanId === '') {
      res.status(400).json({ error: 'gamePlanId must be a non-empty string' })
      return
    }

    const plan = await prisma.gamePlan.findUnique({ where: { id: gamePlanId } })
    if (!plan || plan.userId !== user.id) {
      res.status(404).json({ error: 'Game plan not found' })
      return
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { activeGamePlanId: plan.id },
    })

    res.json({ activeGamePlanId: updated.activeGamePlanId })
  } catch (error) {
    console.error('[PATCH /api/me/active-game-plan] failed:', error)
    res.status(500).json({ error: 'Failed to set active game plan' })
  }
})
