import { useEffect, useId, useRef, useState } from 'react'

import { minutesToMs, msToMinutes, type GamePlan } from './config'
import { type GamePlanInput } from './gamePlansApi'
import { type GamePlansState } from './useGamePlans'

interface FormValues {
  name: string
  work: string
  break_: string
  longBreak: string
  sessions: string
}

const BLANK: FormValues = {
  name: '',
  work: '25',
  break_: '5',
  longBreak: '15',
  sessions: '4',
}

function planToForm(plan: GamePlan): FormValues {
  return {
    name: plan.name,
    work: String(msToMinutes(plan.workDurationMs)),
    break_: String(msToMinutes(plan.breakDurationMs)),
    longBreak: String(msToMinutes(plan.longBreakDurationMs)),
    sessions: String(plan.sessionsBeforeLongBreak),
  }
}

/** Minutes in the UI, milliseconds everywhere else. Converted only here. */
function formToInput(values: FormValues): GamePlanInput | string {
  const name = values.name.trim()
  if (name === '') return 'Give the plan a name'

  const work = Number(values.work)
  const shortBreak = Number(values.break_)
  const longBreak = Number(values.longBreak)
  const sessions = Number(values.sessions)

  for (const [label, value] of [
    ['Focus', work],
    ['Break', shortBreak],
    ['Long break', longBreak],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      return `${label} minutes must be greater than 0`
    }
  }

  if (!Number.isInteger(sessions) || sessions <= 0) {
    return 'Sessions before long break must be a whole number above 0'
  }

  return {
    name,
    workDurationMs: minutesToMs(work),
    breakDurationMs: minutesToMs(shortBreak),
    longBreakDurationMs: minutesToMs(longBreak),
    sessionsBeforeLongBreak: sessions,
  }
}

function PlanForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormValues
  submitLabel: string
  onSubmit: (input: GamePlanInput) => void
  onCancel?: () => void
}) {
  const [values, setValues] = useState(initial)
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()

  const set = (key: keyof FormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }))

  return (
    <form
      className="planform"
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
        className="planform__name"
        placeholder="Plan name"
        aria-label="Plan name"
        value={values.name}
        onChange={set('name')}
      />

      <div className="planform__grid">
        <label htmlFor={`${id}-work`}>Focus</label>
        <input
          id={`${id}-work`}
          type="number"
          min="1"
          step="1"
          value={values.work}
          onChange={set('work')}
        />
        <span className="planform__unit">min</span>

        <label htmlFor={`${id}-break`}>Break</label>
        <input
          id={`${id}-break`}
          type="number"
          min="1"
          step="1"
          value={values.break_}
          onChange={set('break_')}
        />
        <span className="planform__unit">min</span>

        <label htmlFor={`${id}-long`}>Long break</label>
        <input
          id={`${id}-long`}
          type="number"
          min="1"
          step="1"
          value={values.longBreak}
          onChange={set('longBreak')}
        />
        <span className="planform__unit">min</span>

        <label htmlFor={`${id}-sessions`}>Long break every</label>
        <input
          id={`${id}-sessions`}
          type="number"
          min="1"
          step="1"
          value={values.sessions}
          onChange={set('sessions')}
        />
        <span className="planform__unit">sessions</span>
      </div>

      {problem && <p className="planform__problem">{problem}</p>}

      <div className="planform__actions">
        <button type="submit" className="planform__submit">
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="planform__cancel"
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

export function GamePlanPicker({
  state,
  canSwitch,
  switchBlockedReason,
}: {
  state: GamePlansState
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

  const { plans, activePlan } = state
  const onlyPlan = plans.length <= 1

  return (
    <div className="planpicker" ref={containerRef}>
      <button
        type="button"
        className="planpicker__pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="planpicker__pill-label">
          {activePlan?.name ?? 'Game Plan'}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="planpicker__chev">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="planpicker__popover" role="dialog" aria-label="Game Plans">
          {!canSwitch && (
            <p className="planpicker__notice">{switchBlockedReason}</p>
          )}

          {state.error && <p className="planpicker__error">{state.error}</p>}

          <ul className="planlist">
            {plans.map((plan) => {
              const isActive = plan.id === activePlan?.id
              const deleteReason = isActive
                ? "Can't delete the active plan — switch to another first"
                : onlyPlan
                  ? "Can't delete your only plan"
                  : null

              return (
                <li key={plan.id} className="planlist__item">
                  {editingId === plan.id ? (
                    <PlanForm
                      initial={planToForm(plan)}
                      submitLabel="Save"
                      onSubmit={(input) => {
                        void state.update(plan.id, input)
                        setEditingId(null)
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="planlist__select"
                        data-active={isActive}
                        disabled={!canSwitch || isActive}
                        title={!canSwitch ? switchBlockedReason : undefined}
                        onClick={() => void state.activate(plan.id)}
                      >
                        <span className="planlist__dot" data-active={isActive} />
                        <span className="planlist__name">{plan.name}</span>
                        <span className="planlist__meta">
                          {msToMinutes(plan.workDurationMs)} /{' '}
                          {msToMinutes(plan.breakDurationMs)} /{' '}
                          {msToMinutes(plan.longBreakDurationMs)} min
                        </span>
                      </button>

                      <button
                        type="button"
                        className="planlist__icon"
                        aria-label={`Edit ${plan.name}`}
                        title={`Edit ${plan.name}`}
                        onClick={() => setEditingId(plan.id)}
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
                        className="planlist__icon"
                        aria-label={`Delete ${plan.name}`}
                        // Prevented here, not merely rejected by the API.
                        disabled={deleteReason !== null}
                        title={deleteReason ?? `Delete ${plan.name}`}
                        onClick={() => void state.remove(plan.id)}
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

          <div className="planpicker__new">
            <h3 className="planpicker__new-title">New Game Plan</h3>
            <PlanForm
              initial={BLANK}
              submitLabel="Create"
              onSubmit={(input) => void state.create(input)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
