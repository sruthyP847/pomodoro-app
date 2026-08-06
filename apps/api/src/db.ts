import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from './generated/prisma/client.js'

const connectionString = process.env['DATABASE_URL']

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repo root — see SETUP.md.',
  )
}

// Prisma 7 connects through a driver adapter rather than a bundled engine.
const adapter = new PrismaPg({ connectionString })

export const prisma = new PrismaClient({ adapter })
