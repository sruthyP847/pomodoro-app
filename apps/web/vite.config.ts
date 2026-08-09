import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// One .env for the whole monorepo, matching how the API loads env vars.
// Only VITE_-prefixed vars are exposed to client code.
const envDir = fileURLToPath(new URL('../..', import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so we can read unprefixed vars (PORT) here in the config.
  // This does not expose them to the browser.
  const env = loadEnv(mode, envDir, '')

  return {
    plugins: [react()],
    envDir,

    server: {
      // Proxy API calls to the Express app so the browser stays same-origin
      // and we don't need CORS handling in dev.
      proxy: {
        '/api': {
          target: `http://localhost:${env.PORT ?? 3001}`,
          changeOrigin: true,
        },
      },
    },
  }
})
