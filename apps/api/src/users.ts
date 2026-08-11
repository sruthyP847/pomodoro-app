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

/** Every user starts with this plan until they make their own. */
export const DEFAULT_GAME_PLAN = {
  name: 'Classic 25/5',
  workDurationMs: 1_500_000,
  breakDurationMs: 300_000,
  longBreakDurationMs: 900_000,
  sessionsBeforeLongBreak: 4,
} as const

export interface ResolvedUser {
  user: User
  /** True when this call was the one that created the row. */
  created: boolean
}

/**
 * Guarantees the user has at least one GamePlan and an active one selected.
 * Runs on the same lazy-sync path as User creation rather than as a one-off
 * backfill, so users who predate Game Plans get theirs on next request.
 */
async function ensureGamePlan(user: User): Promise<User> {
  const existingCount = await prisma.gamePlan.count({
    where: { userId: user.id },
  })

  if (existingCount === 0) {
    const plan = await prisma.gamePlan.create({
      data: { ...DEFAULT_GAME_PLAN, userId: user.id },
    })

    return prisma.user.update({
      where: { id: user.id },
      data: { activeGamePlanId: plan.id },
    })
  }

  if (user.activeGamePlanId === null) {
    // Plans exist but none is active — nothing should produce this, but the
    // timer has no durations without one, so fall back to the oldest plan.
    const oldest = await prisma.gamePlan.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    })

    if (oldest) {
      return prisma.user.update({
        where: { id: user.id },
        data: { activeGamePlanId: oldest.id },
      })
    }
  }

  return user
}

/**
 * Returns the Postgres User row for a verified Clerk user, creating it on
 * first sight (lazy sync — there is no webhook). Shared by every route that
 * needs the local user, so the sync rule lives in exactly one place.
 */
export async function resolveUser(clerkUserId: string): Promise<ResolvedUser> {
  const existing = await prisma.user.findUnique({ where: { clerkUserId } })

  if (existing) {
    return { user: await ensureGamePlan(existing), created: false }
  }

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

  return { user: await ensureGamePlan(user), created: true }
}
