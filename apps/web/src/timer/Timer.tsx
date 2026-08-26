import { useAuth } from '@clerk/clerk-react'
import { useCallback, useMemo } from 'react'

import { beep, notify, primeAudio, requestNotificationPermission } from './alerts'
import { PHASE_LABELS, planToTimerConfig, type TimerConfig } from './config'
import { GamePlanPicker } from './GamePlanPicker'
import { recordSession } from './sessionsApi'
import { TaskPicker, type BlockScope } from './TaskPicker'
import { useGamePlans } from './useGamePlans'
import { useTasks } from './useTasks'
import { useWorkBlock } from './useWorkBlock'
import { formatDuration, usePomodoro, type Completion } from './usePomodoro'
import { WorkBlockBar } from './WorkBlockBar'

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
  workBlock,
}: {
  config: TimerConfig
  plans: ReturnType<typeof useGamePlans>
  tasks: ReturnType<typeof useTasks>
  workBlock: ReturnType<typeof useWorkBlock>
}) {
  const { getToken } = useAuth()
  const refreshTasks = tasks.refresh
  const refreshBlock = workBlock.refresh

  const handleSessionEnded = useCallback(
    (completion: Completion) => {
      // A phase the user cut short shouldn't announce itself — they're
      // looking at the app, and they're the one who stopped it.
      if (completion.completed) {
        beep()
        notify(completion.phase)
      }

      // Deliberately not awaited: persistence must never gate the transition.
      void recordSession(completion, getToken).then(() => {
        // The server attributes work sessions to the active task, so re-read
        // to pick up the new actualMs — abandoned partials count too.
        if (completion.phase === 'work') {
          void refreshTasks()
          void refreshBlock()
        }
      })
    },
    [getToken, refreshTasks, refreshBlock],
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
  } = usePomodoro(config, { onSessionEnded: handleSessionEnded })

  const isRunning = status === 'running'
  const isBreak = phase !== 'work'

  // Block work is allowed during a break as well as when fully idle — only a
  // running or paused *work* phase locks it.
  const canManageBlock = status === 'idle' || isBreak
  const blockLockReason = 'Finish the focus session to change your Work Block'

  const activeBlock = workBlock.block

  // Inside a block the task picker scopes to that block; without one the
  // standalone flow is untouched, including its idle-only switching rule.
  const blockScope: BlockScope | null = activeBlock
    ? {
        name: activeBlock.name,
        tasks: activeBlock.tasks,
        available: tasks.tasks.filter(
          (task) => !activeBlock.tasks.some((inBlock) => inBlock.id === task.id),
        ),
        addExisting: async (taskId: string) => {
          await workBlock.addExisting(taskId)
          await refreshTasks()
        },
        addNew: async (input) => {
          await workBlock.addNew(input.name, input.estimatedMinutes)
          await refreshTasks()
        },
      }
    : null

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
      <WorkBlockBar
        state={workBlock}
        backlog={tasks.tasks}
        canManage={canManageBlock}
        blockedReason={blockLockReason}
        onCreated={() => void refreshTasks()}
      />

      <TaskPicker
        state={tasks}
        // Pomodoro counts are relative to the active plan's work duration.
        workDurationMs={config.durations.work}
        canSwitch={activeBlock ? canManageBlock : status === 'idle'}
        switchBlockedReason={
          activeBlock ? blockLockReason : 'Reset the timer to switch tasks'
        }
        blockScope={blockScope}
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
  const workBlock = useWorkBlock(getToken)
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

  return (
    <TimerBody
      config={config}
      plans={plans}
      tasks={tasks}
      workBlock={workBlock}
    />
  )
}
