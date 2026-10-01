# CLAUDE.md

Real-time party game platform (Jackbox/Kahoot style). **The single source of truth is
[docs/SPEC.md](docs/SPEC.md)** — read it and [PROGRESS.md](PROGRESS.md) at the start of every
session. Working rules (plan first, one phase at a time, definition of done) are in SPEC §0.

## Commands

Prerequisites: Node 24 (`/opt/homebrew/opt/node@24/bin` on PATH), pnpm 12, Docker.

```bash
cp .env.example .env          # once; also makes `docker compose up` use compose.dev.yml
docker compose up -d --wait   # full dev stack: postgres, redis, setup, server :4000, web :3000
pnpm infra:up                 # only postgres + redis (for host-mode dev and tests)
pnpm dev                      # server + web + shared watch on the host
```

Definition of done (all must pass; tests need postgres + redis, e2e needs the running stack):

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
pnpm format:check
```

Database (Prisma 7, run from the repo root):

```bash
pnpm db:migrate                              # prisma migrate dev (create/apply migrations)
pnpm db:seed                                 # idempotent seed
pnpm --filter @loudroom/server db:generate   # regenerate the client after schema edits
```

## Layout

```
apps/server        NestJS 12 (ESM) — REST + Socket.IO gateway
  prisma/          schema.prisma, migrations/, seed.ts   (prisma.config.ts next to package.json)
  src/bootstrap.ts createApp(config): shared by main.ts and tests
  src/config/      zod-validated env → AppConfig (APP_CONFIG token)
  src/realtime/    gateway, runCommand (zod + ack), Redis Socket.IO adapter
  src/generated/   Prisma client (generated, git-ignored)
  test/            integration tests on real Postgres/Redis (*_test DB, Redis DB 1)
apps/web           Next.js 16 App Router
  src/app/{host,play,admin}  separate layouts; host = scaled 1920×1080 stage
  src/realtime/    socket client, clock sync, RealtimeProvider / RealtimeRoot
  messages/tr.json all UI text (next-intl)
  e2e/             Playwright (chromium + webkit, multi-context)
packages/shared    zod schemas, socket event contracts, shared pure logic
docker/            dev image, postgres init (creates loudroom_test)
```

## Code rules

- Socket event names, payload schemas and types live **only** in `packages/shared`.
  Every command is zod-validated on the server via `runCommand` and acked with
  `{ ok: true, data } | { ok: false, code, message }`.
- Server-authoritative: clients send intents, never scores or state.
- ESM everywhere: relative imports in server/shared end in `.js`. Web uses the `@/` alias.
- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- No `dangerouslySetInnerHTML` (lint-enforced). Web must not import server code (lint-enforced).
- UI text goes into `messages/tr.json`, never hard-coded. Colors/fonts/spacing only via the
  tokens in `apps/web/src/app/globals.css` (`@theme`).
- No mocks, TODOs, stubs or placeholder files for features of later phases (SPEC §0.4).
- Every added package gets a reason in PROGRESS.md. Pin exact versions.

## Gotchas

- `typescript` is pinned to 6.0.x: typescript-eslint does not support TS 7 yet.
  `prisma`/`@prisma/client` pinned to 7.10.x: npm's `latest` tag points at an 8.0 RC.
- `socket.io` must stay on the exact version `@nestjs/platform-socket.io` depends on,
  otherwise two copies get installed and types break.
- Turbo runs tasks in strict env mode: a variable a task needs at runtime must be listed
  (`passThroughEnv` for `dev`, `env` for `test` in turbo.json) or it silently disappears.
- Packages with install scripts must be allowed in `pnpm-workspace.yaml` → `allowBuilds`.
- Server and web read the repo-root `.env` themselves; real environment variables win.
- Changed `.env`/compose environment → `docker compose up -d --force-recreate <service>`.
- `turbo` maintains the block in `AGENTS.md`; keep it committed.
