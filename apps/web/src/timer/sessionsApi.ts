import { type Phase } from './config'
import { type Completion } from './usePomodoro'

/** Phase names as the API stores them. */
const API_TYPE: Record<Phase, string> = {
  work: 'work',
  shortBreak: 'break',
  longBreak: 'long_break',
}

/** The bit of the created row callers need — its id, to attach a reflection. */
export interface RecordedSession {
  id: string
}

/**
 * Records a finished phase. Persistence is best-effort by design: a failure
 * here is logged and swallowed so the timer keeps running locally. Returns the
 * created row on success, or null if it could not be saved.
 */
export async function recordSession(
  completion: Completion,
  getToken: () => Promise<string | null>,
): Promise<RecordedSession | null> {
  try {
    const token = await getToken()

    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        type: API_TYPE[completion.phase],
        startedAt: new Date(completion.startedAt).toISOString(),
        endedAt: new Date(completion.endedAt).toISOString(),
        // The active Game Plan's configured length for this phase, captured
        // when it completed — deliberately not derived from
        // endedAt - startedAt, which includes any time spent paused.
        activeDurationMs: completion.activeDurationMs,
        completed: completion.completed,
      }),
    })

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      console.error('[POST /api/sessions] failed', response.status, body)
      return null
    }

    const saved = (await response.json()) as RecordedSession
    console.log('[POST /api/sessions] saved', saved)
    return saved
  } catch (error) {
    console.error('[POST /api/sessions] request failed', error)
    return null
  }
}

/**
 * Attaches a note to one already-recorded session. Only called with real
 * text — a Skip never reaches the network.
 */
export async function saveReflection(
  sessionId: string,
  reflection: string,
  getToken: () => Promise<string | null>,
): Promise<boolean> {
  try {
    const token = await getToken()

    const response = await fetch(`/api/sessions/${sessionId}/reflection`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reflection }),
    })

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      console.error('[PATCH reflection] failed', response.status, body)
      return false
    }

    return true
  } catch (error) {
    console.error('[PATCH reflection] request failed', error)
    return false
  }
}
