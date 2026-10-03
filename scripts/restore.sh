#!/bin/sh
# Restores the production database and media from a backup pair (docs/DEPLOY.md):
#   scripts/restore.sh backups/db-20261003-030000.dump backups/media-20261003-030000.tar.gz
# The server and web stop during the restore; live rooms (Redis) are cleared, since they
# point at data that no longer exists afterwards.
set -eu
cd "$(dirname "$0")/.."
if [ $# -ne 2 ] || [ ! -f "$1" ] || [ ! -f "$2" ]; then
  echo "usage: scripts/restore.sh <db-….dump> <media-….tar.gz>" >&2
  exit 2
fi
printf 'This replaces the production database and media. Type "restore" to continue: '
read -r answer
[ "$answer" = "restore" ] || { echo "cancelled"; exit 1; }

scripts/prod.sh stop server web
scripts/prod.sh cp "$1" backup:/tmp/restore.dump
scripts/prod.sh cp "$2" backup:/tmp/restore-media.tar.gz
scripts/prod.sh exec -T backup sh -ec '
  pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" /tmp/restore.dump
  find /media-data -mindepth 1 -delete
  tar -xzf /tmp/restore-media.tar.gz -C /media-data
  rm /tmp/restore.dump /tmp/restore-media.tar.gz
'
scripts/prod.sh exec -T redis redis-cli FLUSHDB
scripts/prod.sh start server web
echo "restore finished"
