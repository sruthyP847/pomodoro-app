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

> Nothing connects to Postgres yet — there's no schema or DB client in the apps at this
> stage. The service is here so the rest of the setup is in place.

## 3. Install dependencies

Once, from the repo root. npm workspaces installs both apps together — don't run
`npm install` inside `apps/web` or `apps/api`.

```bash
npm install
```

## 4. Run the apps

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

## 5. Verify it works

- Open http://localhost:5173 — you should see **"Pomme — web app running"**.
- Check the API health route:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"status":"ok"}
```

## Other scripts

Build both apps (type-checks the API and produces a production bundle for the web app):

```bash
npm run build
```

## Troubleshooting

- **Port 5432 already in use** — you likely have another Postgres running. Set
  `POSTGRES_PORT` in `.env` to something free (e.g. `5433`) and re-run `docker compose up -d`.
- **Port 3001 or 5173 in use** — set `PORT` in `.env` for the API; for the web app pass
  `npm run dev:web -- --port 5174`.
- **Changes to `.env` not picked up** — restart the affected process; Docker Compose reads
  `.env` at `up` time, so re-run `docker compose up -d`.
