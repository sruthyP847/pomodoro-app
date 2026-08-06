# Local setup

Getting the Pomme monorepo running on your machine.

## Prerequisites

- **Node.js 22+** (developed on v24) and npm 10+ — `node -v`, `npm -v`
  (22+ is required for the `--env-file-if-exists` flag the API dev script uses)
- **Docker Desktop** (for Postgres) — `docker --version`

## Repo layout

```
pomodoro-app/
├── apps/
│   ├── web/          React + TypeScript (Vite)
│   └── api/          Node + Express + TypeScript
│       ├── prisma/   schema.prisma + migrations
│       └── src/
├── docker-compose.yml
├── .env.example
└── package.json      npm workspaces root
```

## 1. Environment variables

Copy the example file and adjust if you like. The defaults work as-is for local dev.

```bash
cp .env.example .env
```

`.env` is gitignored — never commit it.

## 2. Start Postgres

From the repo root:

```bash
docker compose up -d
```

This starts a single `postgres:16` service on port `5432`, using the credentials from
`.env` and persisting data to the named volume `pomme-postgres-data`.

Useful follow-ups:

```bash
docker compose ps
```

```bash
docker compose logs -f postgres
```

```bash
docker compose down
```

`docker compose down` stops the container but keeps your data. To wipe the database
volume too, use `docker compose down -v`.

The API connects to this database via Prisma using `DATABASE_URL` from `.env`. That value
is a full connection string and is **not** interpolated from the `POSTGRES_*` vars — if you
change the user, password, port, or database name, update `DATABASE_URL` to match.

## 3. Install dependencies

Once, from the repo root. npm workspaces installs both apps together — don't run
`npm install` inside `apps/web` or `apps/api`.

```bash
npm install
```

This also runs `prisma generate` (via the API's `postinstall`), which writes the typed
Prisma client to `apps/api/src/generated/prisma`. That directory is generated output and is
gitignored — after a fresh clone you get it from `npm install`.

## 4. Apply database migrations

With Postgres running, from `apps/api`:

```bash
npm run db:migrate
```

This applies everything in `apps/api/prisma/migrations` and regenerates the client. On a
fresh database it creates the `User` and `Session` tables.

After editing `apps/api/prisma/schema.prisma`, create a new migration with:

```bash
npm run db:migrate -- --name describe_your_change
```

To inspect the data in a browser:

```bash
npm run db:studio
```

## 5. Run the apps


The two apps run as separate long-lived processes, so use two terminal tabs.

**Terminal 1 — API** (http://localhost:3001, hot reload via `tsx watch`):

```bash
npm run dev:api
```

**Terminal 2 — web** (http://localhost:5173, hot reload via Vite):

```bash
npm run dev:web
```

You can also run either app from its own directory with `npm run dev`.

## 6. Verify it works

- Open http://localhost:5173 — you should see **"Pomme — web app running"**.
- Check the API health route, which also runs a query against Postgres:

```bash
curl http://localhost:3001/health
```

Expected response (HTTP 200):

```json
{"status":"ok","database":"connected"}
```

If the database is unreachable the same route returns HTTP 503 with the error code, and the
full error is written to the API's console:

```json
{"status":"error","database":"disconnected","error":"Database query failed (ECONNREFUSED)"}
```

## Other scripts

Build both apps (type-checks the API and produces a production bundle for the web app):

```bash
npm run build
```

## Troubleshooting

- **Port 5432 already in use** — you likely have another Postgres running. Set
  `POSTGRES_PORT` in `.env` to something free (e.g. `5433`) and re-run `docker compose up -d`.
  Update the port in `DATABASE_URL` to match.
- **`/health` returns 503 with `ECONNREFUSED`** — Postgres isn't running or `DATABASE_URL`
  points at the wrong port. Check `docker compose ps`.
- **`DATABASE_URL is not set`** on API startup — you haven't created `.env`; see step 1.
- **Prisma client types missing or stale** — run `npm run db:generate` in `apps/api` (this
  normally happens automatically on `npm install`).
- **Port 3001 or 5173 in use** — set `PORT` in `.env` for the API; for the web app pass
  `npm run dev:web -- --port 5174`.
- **Changes to `.env` not picked up** — restart the affected process; Docker Compose reads
  `.env` at `up` time, so re-run `docker compose up -d`.
