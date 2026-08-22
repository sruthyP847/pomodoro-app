import { useEffect, useId, useRef, useState } from 'react'

import { type Task } from './tasksApi'
import { type WorkBlockState } from './useWorkBlock'

/**
 * Entry point and banner for a Work Block. Renders as an unobtrusive text
 * link until a block is running, so people who never use blocks see almost
 * nothing.
 */
export function WorkBlockBar({
  state,
  backlog,
  canManage,
  blockedReason,
  onCreated,
}: {
  state: WorkBlockState
  backlog: Task[]
  canManage: boolean
  blockedReason: string
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [newMinutes, setNewMinutes] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const id = useId()

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

  const { block } = state

  const toggle = (taskId: string) =>
    setSelected((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    )

  const handleStart = async () => {
    if (name.trim() === '') {
      setProblem('Give the block a name')
      return
    }

    // A brand-new task typed here is created as part of starting the block.
    let newTask: { name: string; estimatedMinutes: number } | undefined
    if (newName.trim() !== '') {
      const minutes = Number(newMinutes)
      if (!Number.isInteger(minutes) || minutes <= 0) {
        setProblem('New task estimate must be a whole number of minutes above 0')
        return
      }
      newTask = { name: newName.trim(), estimatedMinutes: minutes }
    }

    setProblem(null)
    await state.start(name.trim(), [...selected], newTask)
    setName('')
    setSelected([])
    setNewName('')
    setNewMinutes('')
    setOpen(false)
    onCreated()
  }

  if (block) {
    return (
      <div className="workblock" ref={containerRef}>
        <div className="workblock__banner">
          <span className="workblock__label">Work Block</span>
          <span className="workblock__name">{block.name}</span>
          <button
            type="button"
            className="workblock__finish"
            disabled={!canManage}
            title={!canManage ? blockedReason : `Finish ${block.name}`}
            onClick={() => void state.finish()}
          >
            Finish
          </button>
        </div>
        {state.error && <p className="workblock__error">{state.error}</p>}
      </div>
    )
  }

  return (
    <div className="workblock" ref={containerRef}>
      <button
        type="button"
        className="workblock__entry"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!canManage}
        title={!canManage ? blockedReason : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        + Start a Work Block
      </button>

      {open && (
        <div className="workblock__popover" role="dialog" aria-label="Start a Work Block">
          {!canManage && <p className="workblock__notice">{blockedReason}</p>}
          {state.error && <p className="workblock__error">{state.error}</p>}

          <input
            className="workblock__nameinput"
            placeholder="Name this block"
            aria-label="Block name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <h3 className="workblock__section">Include tasks</h3>

          {backlog.length === 0 ? (
            <p className="workblock__empty">No tasks yet — you can start with none.</p>
          ) : (
            <ul className="workblock__tasks">
              {backlog.map((task) => (
                <li key={task.id}>
                  <label className="workblock__check">
                    <input
                      type="checkbox"
                      checked={selected.includes(task.id)}
                      onChange={() => toggle(task.id)}
                    />
                    <span className="workblock__checkname">{task.name}</span>
                    <span className="workblock__checkmeta">
                      {task.estimatedMinutes} min
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <h3 className="workblock__section">Or add a new task</h3>
          <div className="workblock__newtask">
            <input
              placeholder="What are you working on?"
              aria-label="New task name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <div className="workblock__newrow">
              <label htmlFor={`${id}-min`}>Estimate</label>
              <input
                id={`${id}-min`}
                type="number"
                min="1"
                step="1"
                placeholder="60"
                value={newMinutes}
                onChange={(event) => setNewMinutes(event.target.value)}
              />
              <span className="workblock__unit">min</span>
            </div>
          </div>

          {problem && <p className="workblock__problem">{problem}</p>}

          <div className="workblock__actions">
            <button
              type="button"
              className="workblock__start"
              disabled={!canManage}
              onClick={() => void handleStart()}
            >
              Start
            </button>
            <span className="workblock__hint">
              {selected.length === 0
                ? 'Starting with no tasks is fine'
                : `${selected.length} task${selected.length === 1 ? '' : 's'} selected`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
