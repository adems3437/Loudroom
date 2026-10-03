#!/bin/sh
# Docker Compose for the production stack with its own environment file (never .env, which
# holds the development settings). Any compose command works:
#   scripts/prod.sh up -d --build --wait
#   scripts/prod.sh logs -f server
#   scripts/prod.sh run --rm server node dist/cli/admin-create.js --email you@example.com
set -eu
cd "$(dirname "$0")/.."
ENV_FILE=${LOUDROOM_ENV_FILE:-.env.prod}
if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE not found: cp .env.prod.example $ENV_FILE and fill it in" >&2
  exit 1
fi
exec docker compose --env-file "$ENV_FILE" -f compose.yml -f compose.prod.yml "$@"
