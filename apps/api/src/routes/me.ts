import { getAuth } from '@clerk/express'
import { Router } from 'express'

import { MissingEmailError, resolveUser } from '../users.js'

export const meRouter = Router()

/** Returns the Postgres User row for the signed-in Clerk user. */
meRouter.get('/api/me', async (req, res) => {
  const { userId } = getAuth(req)

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const { user, created } = await resolveUser(userId)
    res.status(created ? 201 : 200).json(user)
  } catch (error) {
    if (error instanceof MissingEmailError) {
      res.status(422).json({ error: error.message })
      return
    }

    console.error('[GET /api/me] failed:', error)
    res.status(500).json({ error: 'Failed to load user' })
  }
})
