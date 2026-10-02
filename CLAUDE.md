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
pnpm db:seed                                 # idempotent seed (+ dev admin from ADMIN_SEED_*)
pnpm admin:create --email a@b.c [--name N]   # first admin / --reset a password (prompts, or ADMIN_PASSWORD)
pnpm --filter @loudroom/server db:generate   # regenerate the client after schema edits
```

## Layout

```
apps/server        NestJS 12 (ESM) — REST + Socket.IO gateway
  prisma/          schema.prisma, migrations/, seed.ts   (prisma.config.ts next to package.json)
  src/bootstrap.ts createApp(config): shared by main.ts and tests
  src/config/      zod-validated env → AppConfig (APP_CONFIG token)
  src/realtime/    CommandRunner (rate limit + zod + ack), CommandError, socket types,
                   Redis Socket.IO adapter, time:sync gateway
  src/room/        room store (Redis, SPEC §11 keys), RoomService (per-room lock), views
                   (host/player projections), broadcaster, presence (90 s grace, restart
                   recovery), RoomGateway (handshake token resume + room/player commands)
  src/rate-limit/  Redis token bucket (Lua), hashed client IP
  src/moderation/  profanity filter + TR/EN word lists
  src/game/        engine (state machine, timers), pack loader, session recorder (history),
                   game views, game gateway, registry (gameType → module)
  src/admin/       admin REST API: session store + AdminGuard (cookie, CSRF, Origin, roles),
                   auth, categories, content, media, packs (+ public GET /api/packs), users
  src/http/        ApiException + parseRequest (zod), ApiError filter, REST rate-limit guard
  src/media/       image processing (sniff, sharp → WebP, metadata stripped), MediaStorage
  src/seed/        categories, sample quiz pack, party pack (+ closest number, sorting and
                   "Kim Yapar?" samples), dev admin (fixed ids → idempotent)
  scripts/         admin-create.ts (`pnpm admin:create`)
  src/generated/   Prisma client (generated, git-ignored)
  test/            integration tests on real Postgres/Redis (*_test DB, Redis DB 1)
apps/web           Next.js 16 App Router; next.config rewrites /api and /media to the server
  src/app/{host,play,admin}  separate layouts; host = scaled 1920×1080 stage
    admin/login, admin/(panel)/…        login; panel shell (nav) + content, categories, media,
                                        game-packs, users, account (client pages)
    host/create, host/room/[roomCode]   room creation, lobby (QR, code, players, kick, lock)
    play, play/[roomCode]               code entry, join form, phone lobby
  src/realtime/    socket client (handshake token), sendCommand, clock sync,
                   RealtimeProvider (room state + session) / RealtimeRoot
  src/lib/         session-storage (localStorage + useStoredSession), wake lock, haptics,
                   sfx (WebAudio, no audio files), api (same-origin REST client)
  src/admin/       admin session provider (CSRF token), UI pieces, media picker, content and
                   pack forms
  src/games/       registry (gameType → renderers), round renderer wrappers
  src/app/host/room/[roomCode]/  lobby, game stage, scoreboard, podium
  messages/tr.json all UI text (next-intl)
  e2e/             Playwright (chromium + webkit, multi-context)
packages/shared    zod schemas, socket event contracts, shared pure logic
packages/game-sdk  GameModule contract, seeded RNG; ./testing (contract suite + round
                   harness); ./client (countdown, option shapes, TR number format, settings
                   form fields, renderer types)
packages/games/*   one package per game: schema.ts, server.ts (module), host.tsx, player.tsx,
                   editor.tsx (admin content form), settings-editor.tsx (pack round settings);
                   exports ./server and ./client separately. quiz, closest-number, sorting
                   (@dnd-kit), who-would ("Kim Yapar?")
docker/            dev image, postgres init (creates loudroom_test)
```

## Code rules

- Socket event names, payload schemas and types live **only** in `packages/shared`
  (`clientCommands`, `serverEventSchemas`). Server handlers go through `CommandRunner.run`;
  expected failures throw `CommandError(code)`; acks are
  `{ ok: true, data } | { ok: false, code, message }`. Clients send with `sendCommand`.
- Views sent to clients are built in `room.views.ts` only — never send stored records
  (they contain token hashes). A test asserts no secrets ever reach a client.
- All room mutations go through `RoomService` (under the per-room lock), then the gateway or
  presence service broadcasts the new snapshot.
- Server-authoritative: clients send intents, never scores or state.
- REST: bodies and queries go through `parseRequest(schema, value)`; expected failures throw
  `ApiException(status, code)`; every error body is `ApiError` (`{ code, message, issues? }`).
  REST schemas live in `packages/shared/src/admin`. Admin controllers use `@UseGuards(AdminGuard)`
  (`@AdminOnly()` for ADMIN); users go to clients only through `toAdminUser`.
- Content that refers to an uploaded file uses a string field named `mediaId` (any depth): the
  server checks it exists and keeps files in use from being deleted (`collectMediaIds`).
- Content, media and categories in use cannot be deleted; only PUBLISHED packs reach hosts.
- ESM everywhere: relative imports in server/shared end in `.js`. Web uses the `@/` alias.
- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- No `dangerouslySetInnerHTML` (lint-enforced). Web must not import server code (lint-enforced).
- UI text goes into `messages/tr.json`, never hard-coded. Colors/fonts/spacing only via the
  tokens in `apps/web/src/app/globals.css` (`@theme`).
- No mocks, TODOs, stubs or placeholder files for features of later phases (SPEC §0.4).
- Every added package gets a reason in PROGRESS.md. Pin exact versions.
- New game = new package under `packages/games/` + one line in
  `apps/server/src/game/registry.ts` and `apps/web/src/games/registry.ts` + a `node_modules`
  volume in `compose.dev.yml` and its mount point in `docker/dev.Dockerfile`. It must pass
  `describeGameModuleContract` with `secretVariants` (hidden content) and/or `secretScripts`
  (one player's input hidden from others); games with anonymous choices add
  `anonymousScripts`. Its renderer includes an `editor` (admin content form) and usually a
  `settings` editor. Game UI text lives in `messages/tr.json` under `games.<gameType>` (editor
  texts under `.editor`, settings texts under `.settings`); the admin's game name under
  `admin.gameTypes.<gameType>`.
- Renderers draw avatars with the `Avatar` prop (never import web code) and are keyed by
  round, so local state never leaks into the next round.
- Pack rounds store only settings that differ from the game's defaults; the server checks
  them with the module's `settingsSchema` on every save.
- Game modules are pure and synchronous; the engine does IO, timers, persistence and
  broadcasting. Engine steps run under the room lock (`RoomService.transact`).

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
- Redis adapter: `disconnectSockets` is applied asynchronously via pub/sub. Exclude a socket
  that must survive with `.except(socket.id)`; never rely on ordering.
- Pub/sub channels are shared across Redis DB indexes; the adapter key includes the DB index
  so the dev stack (DB 0) and tests (DB 1) do not hear each other.
- Async server components (e.g. using `getTranslations`) cannot be rendered inside client
  components — shared UI pieces use the sync `useTranslations`.
- `react-hooks` forbids setState inside effects: read external state (localStorage,
  fullscreen) with `useSyncExternalStore`.
- Next's route announcer also has `role="alert"`: e2e tests select by `data-testid`.
- The server publishes state _before_ acking a command. In tests, start listening for the
  expected event before sending the command, or the event is missed.
- The repo lives in an iCloud-synced Desktop. "Keep Downloaded" must stay on for the folder;
  evicted (dataless) files read as empty and break tools. Check with
  `find . -flags +dataless -type f | wc -l`; fix by reading the files or reinstalling deps.
- Game packages build with `tsc` (JSX included); Next uses their `dist`. Tailwind scans their
  sources via `@source` in `globals.css`.
- The admin API is same-origin: Next rewrites `/api/*` and `/media/*` to `API_INTERNAL_URL`
  (read when the config loads: `next dev` start / `next build`). The server sees the web app's
  address for these requests, so admin login limits count failed attempts only.
- Forms cannot be nested: dialogs opened from inside a form (media picker) render through a
  portal and stop submit propagation (React bubbles events through portals).
- The media volume needs the dev image's `/media-data` mount point: after pulling, run
  `docker compose up -d --build` once.
- dnd-kit swallows clicks for 50 ms after a drag; e2e tests wait a moment after dragging.
- In the dev stack every browser reaches the server through the web container's address, so
  the whole e2e suite shares one REST rate-limit bucket (120, +4/s): keep e2e tests frugal
  with page loads.
- Rate-limit buckets live in Redis. To reset them in the dev stack:
  `docker compose exec redis sh -c "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del"`.
