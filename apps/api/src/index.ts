import { clerkMiddleware } from '@clerk/express'
import express from 'express'

import { gamePlansRouter } from './routes/gamePlans.js'
import { healthRouter } from './routes/health.js'
import { meRouter } from './routes/me.js'
import { sessionsRouter } from './routes/sessions.js'
import { tasksRouter } from './routes/tasks.js'
import { workBlocksRouter } from './routes/workBlocks.js'

const secretKey = process.env['CLERK_SECRET_KEY']

// Clerk's backend middleware needs the publishable key as well as the secret.
// It is the same value the frontend uses, and the repo has a single shared
// .env, so we read the VITE_-prefixed name rather than duplicating the value
// under a second key. (The VITE_ prefix only controls what Vite exposes to the
// browser; it has no meaning here.)
const publishableKey = process.env['VITE_CLERK_PUBLISHABLE_KEY']

if (!secretKey || !publishableKey) {
  const missing = [
    !secretKey && 'CLERK_SECRET_KEY',
    !publishableKey && 'VITE_CLERK_PUBLISHABLE_KEY',
  ].filter(Boolean)

  throw new Error(
    `Missing Clerk env var(s): ${missing.join(', ')}. Copy .env.example to .env at the repo root — see SETUP.md.`,
  )
}

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(express.json())

// Mounted before clerkMiddleware so a Clerk misconfiguration can't take the
// health check down with it.
app.use(healthRouter)

// Verifies the session token when present and populates req.auth. It does not
// reject unauthenticated requests — routes do that themselves.
app.use(clerkMiddleware({ secretKey, publishableKey }))

app.use(meRouter)
app.use(sessionsRouter)
app.use(gamePlansRouter)
app.use(tasksRouter)
app.use(workBlocksRouter)

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`)
})
