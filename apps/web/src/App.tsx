import {
  SignIn,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/clerk-react'
import { useEffect, useState } from 'react'

import { Dashboard } from './dashboard/Dashboard'
import { Timer } from './timer/Timer'

import './App.css'

type View = 'timer' | 'dashboard'

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle
        cx="12"
        cy="13"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 9v4l2.5 2M9.5 2h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 20h16M7 20v-6M12 20V6M17 20v-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Two-item view switch. No router — the app has exactly two screens. */
function ViewNav({
  view,
  onChange,
}: {
  view: View
  onChange: (next: View) => void
}) {
  return (
    <nav className="viewnav" aria-label="Views">
      <button
        type="button"
        className="viewnav__button"
        data-active={view === 'timer'}
        aria-current={view === 'timer' ? 'page' : undefined}
        aria-label="Timer"
        title="Timer"
        onClick={() => onChange('timer')}
      >
        <TimerIcon />
      </button>
      <button
        type="button"
        className="viewnav__button"
        data-active={view === 'dashboard'}
        aria-current={view === 'dashboard' ? 'page' : undefined}
        aria-label="This week"
        title="This week"
        onClick={() => onChange('dashboard')}
      >
        <ChartIcon />
      </button>
    </nav>
  )
}

/**
 * Proves the auth loop end to end: mint a session token on the client, send it
 * to the API, and log whatever comes back. No UI yet — console only.
 */
function MeProbe() {
  const { getToken } = useAuth()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const token = await getToken()
        const response = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const body: unknown = await response.json()

        if (cancelled) return

        if (response.ok) {
          console.log('[GET /api/me]', body)
        } else {
          console.error('[GET /api/me] failed', response.status, body)
        }
      } catch (error) {
        if (!cancelled) console.error('[GET /api/me] request failed', error)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [getToken])

  return null
}

function App() {
  const [view, setView] = useState<View>('timer')

  return (
    <>
      <SignedOut>
        <main className="signin">
          <SignIn />
        </main>
      </SignedOut>

      <SignedIn>
        <div className="shell">
          <header className="header">
            <span className="header__brand">Pomme</span>
            <ViewNav view={view} onChange={setView} />
            <UserButton />
          </header>

          {view === 'timer' ? <Timer /> : <Dashboard />}
        </div>

        <MeProbe />
      </SignedIn>
    </>
  )
}

export default App
