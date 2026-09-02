import { getAuth } from '@clerk/express'
import { Router } from 'express'

import { prisma } from '../db.js'
import { MissingEmailError, resolveUser } from '../users.js'

export const sessionsRouter = Router()

const SESSION_TYPES = ['work', 'break', 'long_break'] as const
type SessionType = (typeof SESSION_TYPES)[number]

interface ValidBody {
  type: SessionType
  startedAt: Date
  endedAt: Date
  activeDurationMs: number
  /** False for a phase the user cut short with Reset. */
  completed: boolean
}

/** Returns the parsed body, or a message describing why it was rejected. */
function parseBody(body: unknown): ValidBody | string {
  if (body === null || typeof body !== 'object') return 'Body must be an object'

  const { type, startedAt, endedAt, activeDurationMs, completed } =
    body as Record<string, unknown>

  if (typeof type !== 'string' || !SESSION_TYPES.includes(type as SessionType)) {
    return `type must be one of: ${SESSION_TYPES.join(', ')}`
  }

  if (typeof startedAt !== 'string' || typeof endedAt !== 'string') {
    return 'startedAt and endedAt must be ISO date strings'
  }

  const started = new Date(startedAt)
  const ended = new Date(endedAt)

  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    return 'startedAt and endedAt must be valid ISO date strings'
  }

  if (ended < started) return 'endedAt must not be before startedAt'

  if (
    typeof activeDurationMs !== 'number' ||
    !Number.isInteger(activeDurationMs) ||
    activeDurationMs <= 0
  ) {
    return 'activeDurationMs must be a positive integer number of milliseconds'
  }

  if (typeof completed !== 'boolean') {
    return 'completed must be a boolean'
  }

  return {
    type: type as SessionType,
    startedAt: started,
    endedAt: ended,
    activeDurationMs,
    completed,
  }
}

/** Records a finished focus or break session, completed or abandoned. */
sessionsRouter.post('/api/sessions', async (req, res) => {
  const { userId } = getAuth(req)

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = parseBody(req.body)

  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed })
    return
  }

  try {
    // Same lazy sync as /api/me, so a session can be recorded even if this is
    // somehow the first request we've seen from this user.
    const { user } = await resolveUser(userId)

    const session = await prisma.session.create({
      data: {
        // The Postgres user id, not the Clerk id.
        userId: user.id,
        type: parsed.type,
        startedAt: parsed.startedAt,
        endedAt: parsed.endedAt,
        activeDurationMs: parsed.activeDurationMs,
        completed: parsed.completed,
        // Only work counts toward a task; breaks stay unattributed. Taken
        // from the server's view of the active task, not the client's.
        taskId: parsed.type === 'work' ? user.activeTaskId : null,
        // Every session inside a sitting belongs to it, breaks included.
        workBlockId: user.activeWorkBlockId,
      },
    })

    res.status(201).json(session)
  } catch (error) {
    if (error instanceof MissingEmailError) {
      res.status(422).json({ error: error.message })
      return
    }

    console.error('[POST /api/sessions] failed:', error)
    res.status(500).json({ error: 'Failed to record session' })
  }
})

/** Attaches (or replaces) the free-text note for one finished session. */
sessionsRouter.patch('/api/sessions/:id/reflection', async (req, res) => {
  const { userId } = getAuth(req)

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const reflection = body['reflection']

  if (typeof reflection !== 'string' || reflection.trim() === '') {
    // A Skip should not call this route at all rather than send empty text.
    res.status(400).json({
      error: 'reflection must be a non-empty string',
    })
    return
  }

  try {
    const { user } = await resolveUser(userId)
    const { id } = req.params

    const existing = await prisma.session.findUnique({ where: { id } })
    // Same response whether it's missing or someone else's — don't leak which.
    if (!existing || existing.userId !== user.id) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    const session = await prisma.session.update({
      where: { id },
      data: { reflection: reflection.trim() },
    })

    res.json(session)
  } catch (error) {
    if (error instanceof MissingEmailError) {
      res.status(422).json({ error: error.message })
      return
    }

    console.error('[PATCH /api/sessions/:id/reflection] failed:', error)
    res.status(500).json({ error: 'Failed to save reflection' })
  }
})
