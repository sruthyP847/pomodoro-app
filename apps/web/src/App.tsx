import {
  SignIn,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/clerk-react'
import { useEffect } from 'react'

import { Timer } from './timer/Timer'

import './App.css'

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
            <UserButton />
          </header>

          <Timer />
        </div>

        <MeProbe />
      </SignedIn>
    </>
  )
}

export default App
