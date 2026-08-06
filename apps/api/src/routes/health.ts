import { Router } from 'express'

import { prisma } from '../db.js'

export const healthRouter = Router()

healthRouter.get('/health', async (_req, res) => {
  try {
    // Trivial query — proves the connection and that the schema is migrated.
    await prisma.user.count()
  } catch (error) {
    // Prisma's `message` is a source code frame rather than the cause, so
    // surface the error code and keep the full error in the server log.
    console.error('[health] database check failed:', error)

    const code =
      error !== null && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : undefined

    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: code
        ? `Database query failed (${code})`
        : 'Database query failed',
    })
    return
  }

  res.json({ status: 'ok', database: 'connected' })
})
