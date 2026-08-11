import { type Phase } from './config'
import { type Completion } from './usePomodoro'

/** Phase names as the API stores them. */
const API_TYPE: Record<Phase, string> = {
  work: 'work',
  shortBreak: 'break',
  longBreak: 'long_break',
}

/**
 * Records a finished phase. Persistence is best-effort by design: a failure
 * here is logged and swallowed so the timer keeps running locally.
 */
export async function recordSession(
  completion: Completion,
  getToken: () => Promise<string | null>,
): Promise<void> {
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
      }),
    })

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      console.error('[POST /api/sessions] failed', response.status, body)
      return
    }

    console.log('[POST /api/sessions] saved', await response.json())
  } catch (error) {
    console.error('[POST /api/sessions] request failed', error)
  }
}
