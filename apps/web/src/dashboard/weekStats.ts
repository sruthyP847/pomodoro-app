import { type DashboardSession } from './dashboardApi'

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening'

export interface TopTask {
  taskId: string
  name: string
  totalMs: number
}

export interface WeekStats {
  weekStart: Date
  weekEnd: Date
  sessionCount: number
  totalFocusMs: number
  completedCount: number
  abandonedCount: number
  /** 0–100, rounded. 0 when there are no sessions. */
  completionRate: number
  /** Seven totals, Monday first. */
  dailyMs: number[]
  byTimeOfDay: Record<TimeOfDay, number>
  /** Null when the week has no focus time at all. */
  bestTimeOfDay: TimeOfDay | null
  topTasks: TopTask[]
}

/** Monday 00:00 local time for the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  // getDay() is Sunday-based; shift so Monday is 0.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

/** Monday 00:00 local time of the following week. */
export function endOfWeek(weekStart: Date): Date {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 7)
  return end
}

/** Monday-first index, 0–6. */
export function dayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** Evening wraps past midnight, so it is the fall-through case. */
export function timeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 17) return 'Afternoon'
  return 'Evening'
}

export function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
}

/**
 * Everything the dashboard shows, computed from raw sessions in the browser's
 * own timezone. The server never sees a week boundary.
 */
export function computeWeekStats(
  sessions: DashboardSession[],
  now: Date = new Date(),
): WeekStats {
  const weekStart = startOfWeek(now)
  const weekEnd = endOfWeek(weekStart)

  const thisWeek = sessions.filter((session) => {
    const at = new Date(session.startedAt)
    return at >= weekStart && at < weekEnd
  })

  const dailyMs = [0, 0, 0, 0, 0, 0, 0]
  const byTimeOfDay: Record<TimeOfDay, number> = {
    Morning: 0,
    Afternoon: 0,
    Evening: 0,
  }
  const perTask = new Map<string, TopTask>()

  let totalFocusMs = 0
  let completedCount = 0
  let abandonedCount = 0

  for (const session of thisWeek) {
    const at = new Date(session.startedAt)
    const ms = session.activeDurationMs

    // Abandoned partials count as real focus time, by earlier decision.
    totalFocusMs += ms
    if (session.completed) completedCount += 1
    else abandonedCount += 1

    dailyMs[dayIndex(at)] += ms
    byTimeOfDay[timeOfDay(at)] += ms

    if (session.taskId !== null) {
      const existing = perTask.get(session.taskId)
      if (existing) {
        existing.totalMs += ms
      } else {
        perTask.set(session.taskId, {
          taskId: session.taskId,
          name: session.taskName ?? 'Untitled task',
          totalMs: ms,
        })
      }
    }
  }

  const decided = completedCount + abandonedCount
  const completionRate =
    decided === 0 ? 0 : Math.round((completedCount / decided) * 100)

  const bestTimeOfDay =
    totalFocusMs === 0
      ? null
      : (Object.entries(byTimeOfDay) as [TimeOfDay, number][]).reduce(
          (best, entry) => (entry[1] > best[1] ? entry : best),
        )[0]

  const topTasks = [...perTask.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 5)

  return {
    weekStart,
    weekEnd,
    sessionCount: thisWeek.length,
    totalFocusMs,
    completedCount,
    abandonedCount,
    completionRate,
    dailyMs,
    byTimeOfDay,
    bestTimeOfDay,
    topTasks,
  }
}
