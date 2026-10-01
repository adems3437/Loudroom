# Development image: toolchain only. Source code is bind-mounted by compose.dev.yml.
FROM node:24-slim

# curl: container healthchecks. openssl + ca-certificates: Prisma's migration engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global pnpm@12.8.1 && npm cache clean --force

# Mount points for the named volumes, owned by the unprivileged user so that the volumes are
# created writable for it (they shadow the host's macOS node_modules inside the container).
RUN mkdir -p /app/node_modules /app/apps/server/node_modules /app/apps/web/node_modules \
    /app/packages/shared/node_modules /app/packages/game-sdk/node_modules \
    /app/packages/games/quiz/node_modules /pnpm-store \
  && chown -R node:node /app /pnpm-store

USER node
WORKDIR /app
ENV TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
