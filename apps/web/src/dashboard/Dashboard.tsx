import { useAuth } from '@clerk/clerk-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError } from '../timer/apiClient'
import { fetchDashboardSessions, type DashboardSession } from './dashboardApi'
import {
  computeWeekStats,
  formatHoursMinutes,
  DAY_LABELS,
} from './weekStats'

import './Dashboard.css'

export function Dashboard() {
  const { getToken } = useAuth()
  const [sessions, setSessions] = useState<DashboardSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { sessions: loaded } = await fetchDashboardSessions(getToken)
      setSessions(loaded)
      setError(null)
    } catch (cause) {
      console.error('[dashboard] load failed', cause)
      setError(cause instanceof ApiError ? cause.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void load()
  }, [load])

  // The server sends 8 days of raw rows; the week is carved out here, in the
  // browser's own timezone.
  const stats = useMemo(() => computeWeekStats(sessions), [sessions])

  if (loading) {
    return (
      <main className="dash dash--message">
        <p>Loading this week…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="dash dash--message">
        <p>{error}</p>
      </main>
    )
  }

  const peakMs = Math.max(...stats.dailyMs)
  const isEmpty = stats.sessionCount === 0

  return (
    <main className="dash">
      <h1 className="dash__title">This Week</h1>

      <div className="dash__cards">
        <section className="statcard">
          <h2 className="statcard__label">Total Focus Time</h2>
          <p className="statcard__value" data-total-ms={stats.totalFocusMs}>
            {formatHoursMinutes(stats.totalFocusMs)}
          </p>
        </section>

        <section className="statcard">
          <h2 className="statcard__label">Completion Rate</h2>
          <p className="statcard__value" data-rate={stats.completionRate}>
            {stats.completionRate}%
          </p>
          <p className="statcard__sub">
            {stats.completedCount} completed · {stats.abandonedCount} abandoned
          </p>
        </section>
      </div>

      <section className="chart" aria-label="Focus time per day this week">
        <ol className="chart__bars">
          {stats.dailyMs.map((ms, index) => (
            <li key={DAY_LABELS[index]} className="chart__col">
              <div className="chart__track">
                <div
                  className="chart__bar"
                  // Proportional to the busiest day; zero-height when empty.
                  style={{ height: peakMs > 0 ? `${(ms / peakMs) * 100}%` : '0%' }}
                  data-day={DAY_LABELS[index]}
                  data-ms={ms}
                  title={`${DAY_LABELS[index]}: ${formatHoursMinutes(ms)}`}
                />
              </div>
              <span className="chart__label">{DAY_LABELS[index]}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="callout" data-best={stats.bestTimeOfDay ?? ''}>
        {stats.bestTimeOfDay
          ? `You focus best in the ${stats.bestTimeOfDay}`
          : 'No focus time yet this week'}
      </p>

      <section className="toptasks">
        <h2 className="toptasks__title">Top Tasks</h2>
        {isEmpty || stats.topTasks.length === 0 ? (
          <p className="toptasks__empty">
            {isEmpty ? 'No sessions yet this week' : 'No task-linked sessions yet this week'}
          </p>
        ) : (
          <ul className="toptasks__list">
            {stats.topTasks.map((task) => (
              <li key={task.taskId} className="toptasks__item">
                <span className="toptasks__name">{task.name}</span>
                <span className="toptasks__meta" data-ms={task.totalMs}>
                  {formatHoursMinutes(task.totalMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
