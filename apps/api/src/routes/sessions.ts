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
}

/** Returns the parsed body, or a message describing why it was rejected. */
function parseBody(body: unknown): ValidBody | string {
  if (body === null || typeof body !== 'object') return 'Body must be an object'

  const { type, startedAt, endedAt, activeDurationMs } = body as Record<
    string,
    unknown
  >

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

  return {
    type: type as SessionType,
    startedAt: started,
    endedAt: ended,
    activeDurationMs,
  }
}

/** Records a completed focus or break session. */
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
        completed: true,
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
