export type Phase = 'work' | 'shortBreak' | 'longBreak'

export type Status = 'idle' | 'running' | 'paused'

export const DURATIONS_MS: Record<Phase, number> = {
  work: 25 * 60_000,
  shortBreak: 5 * 60_000,
  longBreak: 15 * 60_000,
}

/** A long break replaces the short break after every Nth work session. */
export const SESSIONS_BEFORE_LONG_BREAK = 4

export const PHASE_LABELS: Record<Phase, string> = {
  work: 'Focus session',
  shortBreak: 'Short break',
  longBreak: 'Long break',
}
