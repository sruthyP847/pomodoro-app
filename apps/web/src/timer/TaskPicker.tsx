import { useEffect, useId, useRef, useState } from 'react'

import { MS_PER_MINUTE } from './config'
import { type Task, type TaskInput } from './tasksApi'
import { type TasksState } from './useTasks'

/**
 * Pomodoro counts are derived from time against the *current* Game Plan, so
 * the same task reads differently under a 25-minute plan than a 50-minute one.
 */
export function actualPomodoros(actualMs: number, workDurationMs: number) {
  return Math.round(actualMs / workDurationMs)
}

export function estimatedPomodoros(
  estimatedMinutes: number,
  workDurationMs: number,
) {
  return Math.ceil((estimatedMinutes * MS_PER_MINUTE) / workDurationMs)
}

interface FormValues {
  name: string
  minutes: string
}

const BLANK: FormValues = { name: '', minutes: '' }

function formToInput(values: FormValues): TaskInput | string {
  const name = values.name.trim()
  if (name === '') return 'Give the task a name'

  const minutes = Number(values.minutes)
  if (!Number.isInteger(minutes) || minutes <= 0) {
    return 'Estimate must be a whole number of minutes above 0'
  }

  return { name, estimatedMinutes: minutes }
}

function TaskForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormValues
  submitLabel: string
  onSubmit: (input: TaskInput) => void
  onCancel?: () => void
}) {
  const [values, setValues] = useState(initial)
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()

  const set =
    (key: keyof FormValues) => (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [key]: event.target.value }))

  return (
    <form
      className="taskform"
      onSubmit={(event) => {
        event.preventDefault()
        const result = formToInput(values)
        if (typeof result === 'string') {
          setProblem(result)
          return
        }
        setProblem(null)
        onSubmit(result)
        setValues(initial)
      }}
    >
      <input
        className="taskform__name"
        placeholder="What are you working on?"
        aria-label="Task name"
        value={values.name}
        onChange={set('name')}
      />

      <div className="taskform__row">
        <label htmlFor={`${id}-minutes`}>Estimate</label>
        <input
          id={`${id}-minutes`}
          type="number"
          min="1"
          step="1"
          placeholder="60"
          value={values.minutes}
          onChange={set('minutes')}
        />
        <span className="taskform__unit">min</span>
      </div>

      {problem && <p className="taskform__problem">{problem}</p>}

      <div className="taskform__actions">
        <button type="submit" className="taskform__submit">
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="taskform__cancel"
            onClick={() => {
              setProblem(null)
              onCancel()
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export function TaskPicker({
  state,
  workDurationMs,
  canSwitch,
  switchBlockedReason,
}: {
  state: TasksState
  workDurationMs: number
  canSwitch: boolean
  switchBlockedReason: string
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Popover, not a page: dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const { tasks, activeTask } = state

  const initialFor = (task: Task): FormValues => ({
    name: task.name,
    minutes: String(task.estimatedMinutes),
  })

  return (
    <div className="taskpicker" ref={containerRef}>
      {activeTask ? (
        <button
          type="button"
          className="taskpicker__pill"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="taskpicker__name">{activeTask.name}</span>
          <span className="taskpicker__sep">·</span>
          <span className="taskpicker__count">
            {actualPomodoros(activeTask.actualMs, workDurationMs)} of{' '}
            {estimatedPomodoros(activeTask.estimatedMinutes, workDurationMs)}
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="taskpicker__pill taskpicker__pill--ghost"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          + Add a task
        </button>
      )}

      {open && (
        <div className="taskpicker__popover" role="dialog" aria-label="Tasks">
          {!canSwitch && (
            <p className="taskpicker__notice">{switchBlockedReason}</p>
          )}

          {state.error && <p className="taskpicker__error">{state.error}</p>}

          <ul className="tasklist">
            <li className="tasklist__item">
              <button
                type="button"
                className="tasklist__select tasklist__select--none"
                data-active={activeTask === null}
                disabled={!canSwitch || activeTask === null}
                title={!canSwitch ? switchBlockedReason : undefined}
                onClick={() => void state.activate(null)}
              >
                <span
                  className="tasklist__dot"
                  data-active={activeTask === null}
                />
                <span className="tasklist__name">No task — plain session</span>
              </button>
            </li>

            {tasks.map((task) => {
              const isActive = task.id === activeTask?.id
              const deleteReason =
                task.sessionCount > 0
                  ? `Can't delete — ${task.sessionCount} recorded session${
                      task.sessionCount === 1 ? '' : 's'
                    }`
                  : null

              return (
                <li key={task.id} className="tasklist__item">
                  {editingId === task.id ? (
                    <TaskForm
                      initial={initialFor(task)}
                      submitLabel="Save"
                      onSubmit={(input) => {
                        void state.update(task.id, input)
                        setEditingId(null)
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="tasklist__select"
                        data-active={isActive}
                        disabled={!canSwitch || isActive}
                        title={!canSwitch ? switchBlockedReason : undefined}
                        onClick={() => void state.activate(task.id)}
                      >
                        <span className="tasklist__dot" data-active={isActive} />
                        <span className="tasklist__name">{task.name}</span>
                        {/* Minutes here, deliberately — pomodoros only on the pill. */}
                        <span className="tasklist__meta">
                          {Math.round(task.actualMs / MS_PER_MINUTE)} of{' '}
                          {task.estimatedMinutes} min
                        </span>
                      </button>

                      <button
                        type="button"
                        className="tasklist__icon"
                        aria-label={`Complete ${task.name}`}
                        title={`Mark ${task.name} complete`}
                        onClick={() => void state.complete(task.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M5 12.5l4.5 4.5L19 7.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      <button
                        type="button"
                        className="tasklist__icon"
                        aria-label={`Edit ${task.name}`}
                        title={`Edit ${task.name}`}
                        onClick={() => setEditingId(task.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      <button
                        type="button"
                        className="tasklist__icon"
                        aria-label={`Delete ${task.name}`}
                        // Prevented here, not merely rejected by the API.
                        disabled={deleteReason !== null}
                        title={deleteReason ?? `Delete ${task.name}`}
                        onClick={() => void state.remove(task.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M6 7h12M9 7V5h6v2m-8 0 1 12h8l1-12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="taskpicker__new">
            <h3 className="taskpicker__new-title">Add a task</h3>
            <TaskForm
              initial={BLANK}
              submitLabel="Add"
              onSubmit={(input) => void state.create(input)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
