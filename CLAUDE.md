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

Production (docs/DEPLOY.md; `.env.prod` from `.env.prod.example`, never the dev `.env`):

```bash
scripts/prod.sh up -d --build --wait   # compose.yml + compose.prod.yml with .env.prod
scripts/prod.sh run --rm server node dist/cli/admin-create.js --email a@b.c
scripts/prod-smoke.sh                  # build, health + WebSocket via Nginx, restore rehearsal
scripts/backup.sh                      # backup now → ./backups;  scripts/restore.sh <dump> <tar>
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
                   game views, game gateway, registry (gameType → module), round stream
                   (GameStreamService + StreamStore: Redis history, limits, host-only fan-out)
  src/admin/       admin REST API: session store + AdminGuard (cookie, CSRF, Origin, roles),
                   auth, categories, content, media, packs (+ public GET /api/packs), users
  src/http/        ApiException + parseRequest (zod), ApiError filter, REST rate-limit guard
  src/import/      CSV/XLSX content import: spreadsheet reader, preview → commit, templates
  src/history/     game history (sessions), statistics, retention purge (SESSION_RETENTION_DAYS)
  src/media/       image processing (sniff, sharp → WebP, metadata stripped), MediaStorage
  src/seed/        categories, sample quiz pack, party pack (+ closest number, sorting and
                   "Kim Yapar?" samples), map pack (maps/*.svg → WebP media, Image Location +
                   Bluff samples), dev admin (fixed ids → idempotent)
  src/cli/         admin-create.ts (`pnpm admin:create`), seed-categories.ts (prod seed)
  scripts/         build-seed-maps.ts (Natural Earth →
                   src/seed/maps/*.svg; run by hand, output committed)
  src/generated/   Prisma client (generated, git-ignored)
  test/            integration tests on real Postgres/Redis (*_test DB, Redis DB 1)
apps/web           Next.js 16 App Router; next.config rewrites /api and /media to the server
  src/app/{host,play,admin}  separate layouts; host = scaled 1920×1080 stage
    admin/login, admin/(panel)/…        login; panel shell (nav) + overview (30-day stats),
                                        content (+ import), categories, media, game-packs,
                                        sessions (history), users, account (client pages)
    host/create, host/room/[roomCode]   room creation, lobby (QR, code, players, kick, lock)
    play, play/[roomCode]               code entry, join form, phone lobby
  src/realtime/    socket client (handshake token), sendCommand, sendStream, clock sync,
                   RealtimeProvider (room state + session + StreamHub) / RealtimeRoot
  src/lib/         session-storage (localStorage + useStoredSession), wake lock, haptics,
                   sfx (WebAudio, no audio files), api (same-origin REST client)
  src/admin/       admin session provider (CSRF token), UI pieces, media picker, content and
                   pack forms
  src/games/       registry (gameType → renderers), round renderer wrappers
  src/app/host/room/[roomCode]/  lobby, game stage, scoreboard, podium
  messages/tr.json all UI text (next-intl)
  e2e/             Playwright (chromium + webkit, multi-context)
packages/shared    zod schemas, socket event contracts, shared pure logic
packages/game-sdk  GameModule contract, seeded RNG, text matching (cleanText, foldText,
                   isNearMatch); ./testing (contract suite + round harness); ./client
                   (countdown, option shapes, TR number format, settings form fields,
                   ContainedImage + image point mapping, renderer types)
packages/table-kit seats/spectators, turns, turn clock + bots, seeded decks and dice, lockstep
                   (parallel turns on one clock); ./client: SeatBar
                   (TV), HandStrip (phone) — shared by the card and board games
packages/games/*   one package per game: schema.ts, server.ts (module), import.ts (CSV/XLSX
                   columns), host.tsx, player.tsx,
                   editor.tsx (admin content form), settings-editor.tsx (pack round settings);
                   exports ./server and ./client separately. quiz, closest-number, sorting
                   (@dnd-kit), who-would ("Kim Yapar?"), image-location, bluff, drawing (round
                   stream, canvas), reaction (hidden phase clock), memory, tombala (host
                   input), spy ("Casus Kim?"), uno, pisti, kizma-birader, amiral-batti
docker/            dev image, postgres init (creates loudroom_test); server.Dockerfile (build stage =
                   migrate image, slim runtime + static ffmpeg), web.Dockerfile (standalone),
                   nginx/ (nginx.conf, locations.conf, sites/http.conf, tls.conf.example),
                   backup/backup.sh, extra-ca.sh (optional proxy CA for builds)
compose.prod.yml   production services on top of compose.yml (nginx is the only public one)
scripts/           prod.sh, prod-smoke.sh, backup.sh, restore.sh
.github/workflows/ CI: typecheck, lint, test (Postgres, Redis, ffmpeg), build, format
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
  volume in `compose.dev.yml` and its mount point in `docker/dev.Dockerfile` + a reference in
  `tsconfig.packages.json` (its `tsconfig.build.json` is `composite` and references
  `game-sdk`). It must pass
  `describeGameModuleContract` with `secretVariants` (hidden content) and/or `secretScripts`
  (one player's input hidden from others; an entry may carry other content too); players or
  the host allowed to know a secret go in `secretHolders` (e.g. the drawer, a TV showing live
  results); games with
  anonymous choices add `anonymousScripts`; games whose reveal is a timed phase set
  `revealPhase`. Its module has an `importer` (CSV/XLSX columns with Turkish ASCII keys; tested
  with `importThrough` from `@loudroom/game-sdk/testing`). Its renderer includes an `editor`
  (admin content form) and usually a `settings` editor. Game UI text lives in `messages/tr.json` under `games.<gameType>` (editor
  texts under `.editor`, settings texts under `.settings`); the admin's game name under
  `admin.gameTypes.<gameType>`.
- Renderers draw avatars with the `Avatar` prop (never import web code) and are keyed by
  round, so local state never leaks into the next round.
- Pack rounds store only settings that differ from the game's defaults; the server checks
  them with the module's `settingsSchema` on every save.
- Modules get image sizes from `ctx.media` (filled by the pack loader from Media) and check
  player text with `ctx.moderation` in `onInput` only — views get a moderation that throws.
  Text players type is compared with the game-sdk text helpers (Turkish folding, typos).
- Images with pins/targets use `ContainedImage` (object-contain + an overlay exactly over the
  drawn image, positions in percent), so TV, phone and admin editor agree.
- A host "skip" while PLAYING drops the round unless the module's `onSkip` handles it.
- A phase effect with `hidden: true` keeps its clock on the server: clients (game:state,
  round:phase, pausedRemainingMs) never learn when it ends. Publish clocks only through
  `publicClock`.
- High-frequency data goes over `round:stream` (no ack, own rate bucket), never `round:input`.
  A module declares `stream` (schema, `accepts`, `cost`, limits); chunks never enter the
  module state. Renderers get a `stream` prop (`subscribe` replays the history, `send`).
- The TV sends round input over `round:hostInput` (host only): a module declares
  `hostInputSchema` + `onHostInput` and refuses with a `reject` effect for
  `HOST_INPUT_SENDER`; its contract fixture then needs `invalidHostInputs`. Host renderers get
  `sendHostInput`. Games without host input answer `INVALID_INPUT`.
- Card and board games: one long round per match; turns are `TURN` phases from table-kit's
  `turnPhase` (an away player's turn gets the bot's short pause). `onPlayersChanged` (the
  engine calls it on disconnect, reconnect, join, leave, kick and resume) hands a turn to the
  bot or back. Hidden hands are tested with the contract's `privateState`, server-only
  secrets (dice seed, deck or bag order) with `serverState`.
- Parallel turns (Amiral Battı's tournament duels) run in lockstep steps on the one phase
  clock: every duel fires once per step; never keep per-duel absolute deadlines (a pause only
  shifts the engine's clock).
- A module's randomness belongs in `createRound`: `ctx.random` restarts from the round seed
  on every call. Later draws derive their own seed (Tombala deals a late joiner's card from
  `seedFromString(cardSeed:playerId)`).
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
- Keep the repo out of iCloud-synced folders (it lives in `~/Developer/Loudroom`). In the iCloud
  Desktop, evicted files read as empty, build output got "name 2.ext" conflict copies, and
  iCloud syncing `dist`/the generated Prisma client touched directories: the Docker server's
  polling watchers saw that and restarted Nest every ~15 s, pausing games in e2e runs.
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
- Turbo runs every package's `dev` watcher as a persistent task; `turbo.json` sets
  `concurrency` above their count (the default 10 broke the dev server at 10 tasks).
- The Docker dev server does not use those per-package watchers: one `tsc --watch` per
  package (~330 MB each) exhausted the 4 GB Docker VM (exit 137). Setup builds all packages
  with one `tsc -b tsconfig.packages.json`, and the server container runs `pnpm dev:packages`
  (one `tsc -b --watch`, turbo root task `//#dev:packages`) next to Nest with `--only`.
- The dev image needs `procps`: `nest start --watch` stops the app with `ps`; without it the
  old process keeps port 4000 and every restart fails with `EADDRINUSE`.
- The Docker server container sets `TSC_WATCHFILE`/`TSC_WATCHDIRECTORY` to
  `DynamicPriorityPolling` (passed through in turbo.json). Docker Desktop forwards
  metadata-only events (iCloud touching files after a build) as changes; event-based watching
  recompiled and restarted Nest every few seconds, killing game timers in e2e runs.
- TypeScript watchers ignore `.next`, `.turbo`, `test-results` and `playwright-report`
  (`watchOptions.excludeDirectories` in tsconfig.base.json): the Docker server polls the whole
  bind mount, and Turbopack writing `.next` restarted Nest mid-game (games pause on restart).
- In Docker, `apps/web/.next` is a named volume (`web-next`), so the container's Turbopack
  cache never mixes with the host's `next`. On the host, a Turbopack "Failed to restore data"
  error means a broken cache: delete `apps/web/.next/dev` (dev) or `apps/web/.next/cache`
  (build).
- The test helper `createPack` adds `introMs: 50` only for games that have that setting:
  settings schemas are strict, an unknown key fails `game:start`.
- Host screens render inside the stage's main area (about 720 px tall above the "next"
  button): a host renderer that overflows covers the stage controls. Fit it, and keep
  `overflow-hidden` on its root.
- Do not change repo files while e2e runs against Docker: the server's watchers poll the
  bind mount, and a restart pauses running games.
- The Docker dev server shares `apps/server/dist` and the package `dist`s with the host via
  the bind mount. A host `pnpm build` deletes and rewrites them, which can leave Nest without
  `dist/main`: run `docker compose restart server` before `pnpm test:e2e`.
- Reloading the host page pauses a running game (host disconnect); e2e tests resume it.
- The seed writes map images into `MEDIA_DIR` (resolved from the server's working directory,
  `/media-data` in Docker); `seedMapPack(prisma, { mediaDir })` lets tests use a temp dir.
- In the dev stack every browser reaches the server through the web container's address, so
  the whole e2e suite shares one REST rate-limit bucket. The dev `.env` raises it
  (`REST_RATE_LIMIT_*`: 600, +20/s; unset in production = 120, +4/s) and `apiRequest` waits
  out a 429 on GETs (3 retries); still keep e2e tests frugal with page loads.
- Videos need ffmpeg/ffprobe (`brew install ffmpeg` in host mode; bundled in the images). The
  server checks for them once at startup; without them video uploads answer
  `VIDEO_UNAVAILABLE` and the video tests are skipped (`hasFfmpeg`).
- Playwright's Chromium has no H.264 decoder: e2e test videos are WebM.
- Host renderers get `paused` (media must stop); `MediaFieldProps` take `accept`
  (`'image' | 'video' | 'any'`) and report the picked kind. Harness frames include the
  `durationMs` clients are told (null for hidden phases), so phase lengths are leak-tested too.
- Docker builds of the web app run `pnpm --filter @loudroom/web... run build`, not turbo:
  turbo's strict env mode would hide the proxy CA variables (`docker/extra-ca.sh`).
- Production-only config checks (`assertProductionSafe`): a weak `IP_HASH_SECRET` or any
  `ADMIN_SEED_*` stops the server when `NODE_ENV=production`.
- Rate-limit buckets live in Redis. To reset them in the dev stack:
  `docker compose exec redis sh -c "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del"`.
