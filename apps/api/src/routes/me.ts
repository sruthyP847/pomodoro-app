import { clerkClient, getAuth } from '@clerk/express'
import { Router } from 'express'

import { prisma } from '../db.js'

export const meRouter = Router()

/**
 * Returns the Postgres User row for the signed-in Clerk user, creating it on
 * first request (lazy sync — there is no webhook).
 */
meRouter.get('/api/me', async (req, res) => {
  const { userId } = getAuth(req)

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { clerkUserId: userId },
    })

    if (existing) {
      res.json(existing)
      return
    }

    const clerkUser = await clerkClient.users.getUser(userId)
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress

    if (!email) {
      res.status(422).json({
        error: 'Clerk user has no email address to sync',
      })
      return
    }

    // upsert rather than create: two parallel first requests would otherwise
    // race and one would fail the clerkUserId unique constraint.
    const user = await prisma.user.upsert({
      where: { clerkUserId: userId },
      update: {},
      create: { clerkUserId: userId, email },
    })

    res.status(201).json(user)
  } catch (error) {
    console.error('[GET /api/me] failed:', error)
    res.status(500).json({ error: 'Failed to load user' })
  }
})
