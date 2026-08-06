import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'prisma/config'

// Prisma 7 does not load .env files on its own. Load the repo-root .env the same
// way the API's dev script does (node --env-file-if-exists=../../.env), using
// Node's built-in loader so we don't need a dotenv dependency.
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env')
if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
