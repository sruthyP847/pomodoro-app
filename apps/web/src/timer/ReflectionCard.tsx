import { useState } from 'react'

/**
 * Post-session prompt. Deliberately non-blocking: it floats above the timer
 * and never gates the break, which has already auto-started underneath.
 */
export function ReflectionCard({
  onSave,
  onSkip,
}: {
  onSave: (reflection: string) => void
  onSkip: () => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const trimmed = text.trim()

  const submit = () => {
    // Empty text is a Skip — the endpoint is never called with blank input.
    if (trimmed === '') {
      onSkip()
      return
    }
    setSaving(true)
    onSave(trimmed)
  }

  return (
    <aside className="reflection" role="dialog" aria-label="Session reflection">
      <button
        type="button"
        className="reflection__close"
        aria-label="Skip reflection"
        title="Skip"
        onClick={onSkip}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <p className="reflection__prompt">What did you get done?</p>

      <form
        className="reflection__form"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          className="reflection__input"
          aria-label="Reflection"
          placeholder="A line is plenty"
          value={text}
          autoFocus
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="submit"
          className="reflection__save"
          disabled={saving || trimmed === ''}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </aside>
  )
}
