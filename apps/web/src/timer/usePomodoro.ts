import { useEffect, useReducer } from 'react'

import {
  DURATIONS_MS,
  SESSIONS_BEFORE_LONG_BREAK,
  type Phase,
  type Status,
} from './config'

/** How often we recompute the display. Not what drives accuracy — see below. */
const TICK_MS = 200

interface State {
  phase: Phase
  status: Status
  /**
   * Wall-clock instant the current phase ends. Remaining time is always
   * derived from this rather than accumulated by decrementing a counter, so
   * the countdown can't drift and stays correct across a backgrounded tab.
   */
  endsAt: number | null
  /** Remaining time while idle or paused, when there is no endsAt. */
  restingRemainingMs: number
  completedWorkSessions: number
  /** Latest observed clock reading, kept in state so ticks re-render. */
  now: number
}

type Action =
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RESET' }
  | { type: 'TICK'; now: number }

function idleState(now: number): State {
  return {
    phase: 'work',
    status: 'idle',
    endsAt: null,
    restingRemainingMs: DURATIONS_MS.work,
    completedWorkSessions: 0,
    now,
  }
}

/** Which phase follows the one that just finished, and the updated dot count. */
function advance(state: State): Pick<State, 'phase' | 'completedWorkSessions'> {
  if (state.phase === 'work') {
    const completedWorkSessions = state.completedWorkSessions + 1
    const earnedLongBreak =
      completedWorkSessions % SESSIONS_BEFORE_LONG_BREAK === 0

    return {
      phase: earnedLongBreak ? 'longBreak' : 'shortBreak',
      completedWorkSessions,
    }
  }

  return {
    phase: 'work',
    // The dots clear once the long break is over, not when it starts.
    completedWorkSessions:
      state.phase === 'longBreak' ? 0 : state.completedWorkSessions,
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':
    case 'RESUME': {
      const now = Date.now()
      return {
        ...state,
        status: 'running',
        endsAt: now + state.restingRemainingMs,
        now,
      }
    }

    case 'PAUSE': {
      const now = Date.now()
      if (state.status !== 'running' || state.endsAt === null) return state

      return {
        ...state,
        status: 'paused',
        // Freeze exactly what was left at this instant.
        restingRemainingMs: Math.max(0, state.endsAt - now),
        endsAt: null,
        now,
      }
    }

    case 'RESET':
      return idleState(Date.now())

    case 'TICK': {
      const { now } = action
      let next: State = { ...state, now }

      // A loop rather than a single step: if the tab slept through an entire
      // phase (or several), catch up in one pass. Each phase is chained from
      // the previous phase's exact end instant, so no time is lost.
      while (
        next.status === 'running' &&
        next.endsAt !== null &&
        now >= next.endsAt
      ) {
        const finishedAt = next.endsAt
        const { phase, completedWorkSessions } = advance(next)

        next = {
          ...next,
          phase,
          completedWorkSessions,
          // Auto-start the next phase; no confirmation step.
          status: 'running',
          endsAt: finishedAt + DURATIONS_MS[phase],
          restingRemainingMs: DURATIONS_MS[phase],
        }
      }

      return next
    }
  }
}

export interface Pomodoro {
  phase: Phase
  status: Status
  remainingMs: number
  completedWorkSessions: number
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
}

export function usePomodoro(): Pomodoro {
  const [state, dispatch] = useReducer(reducer, Date.now(), idleState)

  useEffect(() => {
    if (state.status !== 'running') return

    const tick = () => dispatch({ type: 'TICK', now: Date.now() })
    const id = setInterval(tick, TICK_MS)

    // Browsers throttle timers in background tabs, so resync the moment the
    // tab is looked at again instead of waiting for the next interval.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [state.status])

  const remainingMs =
    state.status === 'running' && state.endsAt !== null
      ? Math.max(0, state.endsAt - state.now)
      : state.restingRemainingMs

  return {
    phase: state.phase,
    status: state.status,
    remainingMs,
    completedWorkSessions: state.completedWorkSessions,
    start: () => dispatch({ type: 'START' }),
    pause: () => dispatch({ type: 'PAUSE' }),
    resume: () => dispatch({ type: 'RESUME' }),
    reset: () => dispatch({ type: 'RESET' }),
  }
}

export function formatDuration(ms: number): string {
  // Ceil so a fresh 25-minute phase reads 25:00 and only hits 00:00 at the end.
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
