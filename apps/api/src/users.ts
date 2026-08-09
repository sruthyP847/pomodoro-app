import { clerkClient } from '@clerk/express'
import type { User } from './generated/prisma/client.js'

import { prisma } from './db.js'

/** Thrown when Clerk has no email address we can sync into Postgres. */
export class MissingEmailError extends Error {
  constructor(clerkUserId: string) {
    super(`Clerk user ${clerkUserId} has no email address to sync`)
    this.name = 'MissingEmailError'
  }
}

export interface ResolvedUser {
  user: User
  /** True when this call was the one that created the row. */
  created: boolean
}

/**
 * Returns the Postgres User row for a verified Clerk user, creating it on
 * first sight (lazy sync — there is no webhook). Shared by every route that
 * needs the local user, so the sync rule lives in exactly one place.
 */
export async function resolveUser(clerkUserId: string): Promise<ResolvedUser> {
  const existing = await prisma.user.findUnique({ where: { clerkUserId } })

  if (existing) return { user: existing, created: false }

  const clerkUser = await clerkClient.users.getUser(clerkUserId)
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress

  if (!email) throw new MissingEmailError(clerkUserId)

  // upsert rather than create: two parallel first requests would otherwise
  // race and one would fail the clerkUserId unique constraint.
  const user = await prisma.user.upsert({
    where: { clerkUserId },
    update: {},
    create: { clerkUserId, email },
  })

  return { user, created: true }
}
