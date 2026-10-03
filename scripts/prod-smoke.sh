#!/bin/sh
# Verifies the production stack on this machine (Phase 9 F9–F11, docs/DEPLOY.md):
#   1. builds and starts it (scripts/prod.sh up --build --wait)
#   2. health and a Socket.IO WebSocket upgrade through Nginx
#   3. a backup, restored into a scratch database: every table must have the same row count,
#      and the media archive the same files as the media volume
#   4. with E2E=1, the end-to-end tests that need no sample content, against Nginx
#      (PLAYWRIGHT_ARGS adds Playwright options, e.g. "--project=chromium")
# Needs .env.prod; leaves the stack running.
set -eu
cd "$(dirname "$0")/.."
port=$(sed -n 's/^HTTP_PORT=//p' "${LOUDROOM_ENV_FILE:-.env.prod}")
base="http://localhost:${port:-80}"

echo "== build and start"
scripts/prod.sh up -d --build --wait

echo "== health and WebSocket through Nginx ($base)"
curl -fsS "$base/health"
echo
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "$base/socket.io/?EIO=4&transport=websocket" || true)
[ "$code" = "101" ] || { echo "WebSocket upgrade failed: HTTP $code" >&2; exit 1; }
echo "WebSocket upgrade: 101"

echo "== backup and restore rehearsal"
scripts/prod.sh exec -T backup /bin/sh /opt/loudroom/backup.sh once
scripts/prod.sh exec -T backup sh -ec '
  dump=$(ls -1t /backups/db-*.dump | head -1)
  media=$(ls -1t /backups/media-*.tar.gz | head -1)
  dropdb --if-exists restore_check
  createdb restore_check
  pg_restore --no-owner --dbname=restore_check "$dump"
  tables=$(psql -tA -c "SELECT tablename FROM pg_tables WHERE schemaname = '"'"'public'"'"' ORDER BY 1")
  for table in $tables; do
    live=$(psql -tA -c "SELECT count(*) FROM \"$table\"")
    restored=$(psql -tA -d restore_check -c "SELECT count(*) FROM \"$table\"")
    [ "$live" = "$restored" ] || { echo "$table: $live rows, restored $restored" >&2; exit 1; }
  done
  dropdb restore_check
  echo "database: $(echo "$tables" | wc -w) tables restored with identical row counts"
  in_volume=$(find /media-data -type f | wc -l)
  in_archive=$(tar -tzf "$media" | grep -cv "/$" || true)
  [ "$in_volume" = "$in_archive" ] || { echo "media: $in_volume files, archive $in_archive" >&2; exit 1; }
  echo "media: $in_archive files in the archive"
'

if [ "${E2E:-0}" = "1" ]; then
  echo "== end-to-end tests against $base"
  # shellcheck disable=SC2086 # PLAYWRIGHT_ARGS is a list of options
  E2E_BASE_URL="$base" E2E_HEALTH_URL="$base/health" pnpm --filter @loudroom/web exec playwright test \
    ${PLAYWRIGHT_ARGS:-} e2e/connection.spec.ts e2e/lobby.spec.ts e2e/admin.spec.ts e2e/video.spec.ts
fi
echo "== production stack OK"
