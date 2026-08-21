import { useAuth } from '@clerk/clerk-react'
import { useCallback, useMemo } from 'react'

import { beep, notify, primeAudio, requestNotificationPermission } from './alerts'
import { PHASE_LABELS, planToTimerConfig, type TimerConfig } from './config'
import { GamePlanPicker } from './GamePlanPicker'
import { recordSession } from './sessionsApi'
import { TaskPicker } from './TaskPicker'
import { useGamePlans } from './useGamePlans'
import { useTasks } from './useTasks'
import { formatDuration, usePomodoro, type Completion } from './usePomodoro'

import './Timer.css'

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" />
    </svg>
  )
}

/** The timer itself, once we know which Game Plan it runs on. */
function TimerBody({
  config,
  plans,
  tasks,
}: {
  config: TimerConfig
  plans: ReturnType<typeof useGamePlans>
  tasks: ReturnType<typeof useTasks>
}) {
  const { getToken } = useAuth()
  const refreshTasks = tasks.refresh

  const handlePhaseComplete = useCallback(
    (completion: Completion) => {
      beep()
      notify(completion.phase)
      // Deliberately not awaited: persistence must never gate the transition.
      void recordSession(completion, getToken).then(() => {
        // The server attributes work sessions to the active task, so re-read
        // to pick up the new actualMs.
        if (completion.phase === 'work') void refreshTasks()
      })
    },
    [getToken, refreshTasks],
  )

  const {
    phase,
    status,
    remainingMs,
    completedWorkSessions,
    sessionsBeforeLongBreak,
    start,
    pause,
    resume,
    reset,
  } = usePomodoro(config, { onPhaseComplete: handlePhaseComplete })

  const isRunning = status === 'running'
  const isBreak = phase !== 'work'

  const primaryLabel =
    status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Start'

  const handlePrimary = () => {
    if (status === 'running') {
      pause()
      return
    }

    // Both on a first Start and on Resume: these need a user gesture, and both
    // helpers are no-ops once they've already run.
    primeAudio()
    requestNotificationPermission()

    if (status === 'paused') resume()
    else start()
  }

  return (
    <main
      className="timer"
      data-phase={isBreak ? 'break' : 'work'}
      data-status={status}
    >
      <TaskPicker
        state={tasks}
        // Pomodoro counts are relative to the active plan's work duration.
        workDurationMs={config.durations.work}
        canSwitch={status === 'idle'}
        switchBlockedReason="Reset the timer to switch tasks"
      />

      <GamePlanPicker
        state={plans}
        // Changing durations mid-phase would invalidate the running countdown.
        canSwitch={status === 'idle'}
        switchBlockedReason="Reset the timer to switch Game Plans"
      />

      <p className="timer__phase">
        {PHASE_LABELS[phase]}
        {status === 'paused' && <span className="timer__tag">Paused</span>}
      </p>

      <div className="timer__display" role="timer" aria-live="off">
        {formatDuration(remainingMs)}
      </div>

      <div className="timer__controls">
        <button
          type="button"
          className="timer__button timer__button--primary"
          onClick={handlePrimary}
        >
          {isRunning ? <PauseIcon /> : <PlayIcon />}
          {primaryLabel}
        </button>

        <button
          type="button"
          className="timer__button timer__button--secondary"
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <ol
        className="timer__dots"
        aria-label={`${completedWorkSessions} of ${sessionsBeforeLongBreak} focus sessions complete`}
      >
        {Array.from({ length: sessionsBeforeLongBreak }, (_, index) => (
          <li
            key={index}
            className="timer__dot"
            data-filled={index < completedWorkSessions}
          />
        ))}
      </ol>
    </main>
  )
}

export function Timer() {
  const { getToken } = useAuth()
  const plans = useGamePlans(getToken)
  const tasks = useTasks(getToken)
  const { activePlan } = plans

  // Memoised so the timer only re-configures when the plan's values change.
  const config = useMemo(
    () => (activePlan ? planToTimerConfig(activePlan) : null),
    [activePlan],
  )

  if (plans.loading) {
    return (
      <main className="timer timer--message">
        <p>Loading your Game Plan…</p>
      </main>
    )
  }

  // No hardcoded fallback: the active plan is the source of truth.
  if (!config) {
    return (
      <main className="timer timer--message">
        <p>{plans.error ?? 'No Game Plan available.'}</p>
      </main>
    )
  }

  return <TimerBody config={config} plans={plans} tasks={tasks} />
}
