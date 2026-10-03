#!/bin/sh
# Takes a backup of the production stack now and copies it to ./backups on this machine.
#   scripts/backup.sh
set -eu
cd "$(dirname "$0")/.."
scripts/prod.sh exec -T backup /bin/sh /opt/loudroom/backup.sh once
mkdir -p backups
scripts/prod.sh cp backup:/backups/. backups/
echo "backups copied to ./backups:"
ls -1t backups | head -4
