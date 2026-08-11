export type Phase = 'work' | 'shortBreak' | 'longBreak'

export type Status = 'idle' | 'running' | 'paused'

export const PHASE_LABELS: Record<Phase, string> = {
  work: 'Focus session',
  shortBreak: 'Short break',
  longBreak: 'Long break',
}

/** A Game Plan as the API returns it. Durations are always milliseconds. */
export interface GamePlan {
  id: string
  name: string
  workDurationMs: number
  breakDurationMs: number
  longBreakDurationMs: number
  sessionsBeforeLongBreak: number
  createdAt: string
}

/**
 * What the timer needs to run. There is no hardcoded default: the active Game
 * Plan is the source of truth, so the timer doesn't render until one loads.
 */
export interface TimerConfig {
  durations: Record<Phase, number>
  sessionsBeforeLongBreak: number
}

export function planToTimerConfig(plan: GamePlan): TimerConfig {
  return {
    durations: {
      work: plan.workDurationMs,
      shortBreak: plan.breakDurationMs,
      longBreak: plan.longBreakDurationMs,
    },
    sessionsBeforeLongBreak: plan.sessionsBeforeLongBreak,
  }
}

export const MS_PER_MINUTE = 60_000

export function msToMinutes(ms: number): number {
  return Math.round((ms / MS_PER_MINUTE) * 100) / 100
}

export function minutesToMs(minutes: number): number {
  return Math.round(minutes * MS_PER_MINUTE)
}
