import { PHASE_LABELS, SESSIONS_BEFORE_LONG_BREAK } from './config'
import { formatDuration, usePomodoro } from './usePomodoro'

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
  const {
    phase,
    status,
    remainingMs,
    completedWorkSessions,
    start,
    pause,
    resume,
    reset,
  } = usePomodoro()

  const isRunning = status === 'running'
  const isBreak = phase !== 'work'

  const primaryLabel =
    status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Start'

  const onPrimary =
    status === 'running' ? pause : status === 'paused' ? resume : start

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
          onClick={onPrimary}
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
