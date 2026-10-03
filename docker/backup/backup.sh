#!/bin/sh
# Backups of the production stack (SPEC §13, Phase 9 F11), run in the `backup` service:
#   backup.sh loop    every day at BACKUP_HOUR (TZ), then keep BACKUP_KEEP_DAYS days
#   backup.sh once    one backup now (scripts/backup.sh)
# Each backup is a custom-format pg_dump (db-*.dump) and a tar of the media files
# (media-*.tar.gz) with the same timestamp, written to /backups. Redis is not backed up: live
# rooms are temporary.
set -eu

BACKUP_DIR=/backups
MEDIA_DIR=/media-data
: "${BACKUP_HOUR:=3}" "${BACKUP_KEEP_DAYS:=14}"

backup_once() {
  stamp=$(date +%Y%m%d-%H%M%S)
  # Written under a temporary name first: a half-written file never looks like a backup.
  pg_dump --format=custom --file="$BACKUP_DIR/db-$stamp.dump.partial"
  mv "$BACKUP_DIR/db-$stamp.dump.partial" "$BACKUP_DIR/db-$stamp.dump"
  tar -czf "$BACKUP_DIR/media-$stamp.tar.gz.partial" -C "$MEDIA_DIR" .
  mv "$BACKUP_DIR/media-$stamp.tar.gz.partial" "$BACKUP_DIR/media-$stamp.tar.gz"
  find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*' -o -name 'media-*' \) \
    -mtime +"$BACKUP_KEEP_DAYS" -delete
  find "$BACKUP_DIR" -maxdepth 1 -name '*.partial' -mmin +60 -delete
  echo "backup $stamp done: $(du -h "$BACKUP_DIR/db-$stamp.dump" "$BACKUP_DIR/media-$stamp.tar.gz" | tr '\n' ' ')"
}

case "${1:-loop}" in
  once)
    backup_once
    ;;
  loop)
    echo "backups every day at $BACKUP_HOUR:00 ($(date +%Z)), kept $BACKUP_KEEP_DAYS days"
    last=""
    while true; do
      today=$(date +%Y-%m-%d)
      if [ "$(date +%H)" -eq "$BACKUP_HOUR" ] && [ "$last" != "$today" ]; then
        if backup_once; then last=$today; else echo "backup failed; retrying in a minute" >&2; fi
      fi
      sleep 60
    done
    ;;
  *)
    echo "usage: backup.sh once|loop" >&2
    exit 2
    ;;
esac
