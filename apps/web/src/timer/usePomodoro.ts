import { useEffect, useReducer, useRef } from 'react'

import {
  DURATIONS_MS,
  SESSIONS_BEFORE_LONG_BREAK,
  type Phase,
  type Status,
} from './config'

/** How often we recompute the display. Not what drives accuracy — see below. */
const TICK_MS = 200

/** A phase that ran to completion. Emitted once, never for a Reset. */
export interface Completion {
  id: number
  phase: Phase
  /** The phase that started immediately after this one. */
  next: Phase
  startedAt: number
  endedAt: number
}

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
  /** When the current phase first began, spanning any pauses. */
  phaseStartedAt: number | null
  completedWorkSessions: number
  /**
   * Append-only log of finished phases. The reducer stays pure; a consumer
   * drains this via a cursor and does the side effects.
   */
  completions: Completion[]
  nextCompletionId: number
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
    phaseStartedAt: null,
    completedWorkSessions: 0,
    completions: [],
    nextCompletionId: 1,
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
    case 'START': {
      const now = Date.now()
      return {
        ...state,
        status: 'running',
        endsAt: now + state.restingRemainingMs,
        phaseStartedAt: now,
        now,
      }
    }

    case 'RESUME': {
      const now = Date.now()
      return {
        ...state,
        status: 'running',
        endsAt: now + state.restingRemainingMs,
        // Deliberately unchanged: the phase began before the pause.
        phaseStartedAt: state.phaseStartedAt ?? now,
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

    case 'RESET': {
      // Completions are append-only, so an in-flight phase is simply dropped:
      // abandoned sessions are not recorded.
      const fresh = idleState(Date.now())
      return {
        ...fresh,
        completions: state.completions,
        nextCompletionId: state.nextCompletionId,
      }
    }

    case 'TICK': {
      const { now } = action

      if (state.status !== 'running' || state.endsAt === null) {
        return { ...state, now }
      }

      // Current phase still has time left: nothing to settle.
      if (now < state.endsAt) return { ...state, now }

      const finishedAt = state.endsAt
      const finishedPhase = state.phase
      const { phase, completedWorkSessions } = advance(state)

      // Would the *next* phase also have run out before now? If so the tab was
      // away for longer than a single phase and we have no idea how much of any
      // of it the user was actually present for. Don't invent completions —
      // including for this first phase — and fall back to a clean slate.
      if (now >= finishedAt + DURATIONS_MS[phase]) {
        return reducer(state, { type: 'RESET' })
      }

      // Exactly one phase elapsed: the ordinary case, including a short
      // background gap. Chain from the exact end instant so no time is lost.
      const completion: Completion = {
        id: state.nextCompletionId,
        phase: finishedPhase,
        next: phase,
        startedAt:
          state.phaseStartedAt ?? finishedAt - DURATIONS_MS[finishedPhase],
        endedAt: finishedAt,
      }

      return {
        ...state,
        now,
        phase,
        completedWorkSessions,
        // Auto-start the next phase; no confirmation step.
        status: 'running',
        endsAt: finishedAt + DURATIONS_MS[phase],
        restingRemainingMs: DURATIONS_MS[phase],
        phaseStartedAt: finishedAt,
        completions: [...state.completions, completion],
        nextCompletionId: state.nextCompletionId + 1,
      }
    }
  }
}

export interface UsePomodoroOptions {
  /** Called once per finished phase, in order. Side effects belong here. */
  onPhaseComplete?: (completion: Completion) => void
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

export function usePomodoro(options: UsePomodoroOptions = {}): Pomodoro {
  const [state, dispatch] = useReducer(reducer, Date.now(), idleState)

  // Kept in a ref so a new callback identity each render doesn't re-run the
  // drain effect (and so the effect never sees a stale closure).
  const onPhaseComplete = useRef(options.onPhaseComplete)
  onPhaseComplete.current = options.onPhaseComplete

  // Cursor into the append-only log. A ref survives StrictMode's double-invoked
  // effects, so each completion fires its side effects exactly once.
  const processedId = useRef(0)

  useEffect(() => {
    const fresh = state.completions.filter((c) => c.id > processedId.current)
    if (fresh.length === 0) return

    processedId.current = fresh[fresh.length - 1]!.id
    for (const completion of fresh) onPhaseComplete.current?.(completion)
  }, [state.completions])

  useEffect(() => {
    if (state.status !== 'running') return

    const tick = () => dispatch({ type: 'TICK', now: Date.now() })
    const id = setInterval(tick, TICK_MS)

    // Browsers throttle timers in background tabs, so resync the moment the
    // tab is looked at again instead of waiting for the next interval. This
    // goes through the same TICK, so the abandonment check in the reducer
    // covers this path too — and this is where a long gap usually surfaces.
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
