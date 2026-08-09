import { useAuth } from '@clerk/clerk-react'
import { useCallback } from 'react'

import { beep, notify, primeAudio, requestNotificationPermission } from './alerts'
import { PHASE_LABELS, SESSIONS_BEFORE_LONG_BREAK } from './config'
import { recordSession } from './sessionsApi'
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

export function Timer() {
  const { getToken } = useAuth()

  const handlePhaseComplete = useCallback(
    (completion: Completion) => {
      beep()
      notify(completion.phase)
      // Deliberately not awaited: persistence must never gate the transition.
      void recordSession(completion, getToken)
    },
    [getToken],
  )

  const {
    phase,
    status,
    remainingMs,
    completedWorkSessions,
    start,
    pause,
    resume,
    reset,
  } = usePomodoro({ onPhaseComplete: handlePhaseComplete })

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
        aria-label={`${completedWorkSessions} of ${SESSIONS_BEFORE_LONG_BREAK} focus sessions complete`}
      >
        {Array.from({ length: SESSIONS_BEFORE_LONG_BREAK }, (_, index) => (
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
