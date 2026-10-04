# Development image: toolchain only. Source code is bind-mounted by compose.dev.yml.
# Static ffmpeg/ffprobe builds for video uploads (same as the production image).
FROM mwader/static-ffmpeg:7.1.1 AS ffmpeg

FROM node:24-slim

COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/

# curl: container healthchecks. openssl + ca-certificates: Prisma's migration engine.
# procps: `nest start --watch` finds the app process to stop with `ps`; without it the old
# process keeps port 4000 and every restart fails with EADDRINUSE.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates openssl procps \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global pnpm@12.8.1 && npm cache clean --force

# Mount points for the named volumes, owned by the unprivileged user so that the volumes are
# created writable for it (they shadow the host's macOS node_modules inside the container).
RUN mkdir -p /app/node_modules /app/apps/server/node_modules /app/apps/web/node_modules \
    /app/packages/shared/node_modules /app/packages/game-sdk/node_modules \
    /app/packages/games/quiz/node_modules /app/packages/games/closest-number/node_modules \
    /app/packages/games/sorting/node_modules /app/packages/games/who-would/node_modules \
    /app/packages/games/image-location/node_modules /app/packages/games/bluff/node_modules \
    /app/packages/games/drawing/node_modules /app/packages/games/reaction/node_modules \
    /app/packages/games/memory/node_modules /app/packages/games/tombala/node_modules \
    /app/packages/games/spy/node_modules \
    /pnpm-store /media-data \
  && chown -R node:node /app /pnpm-store /media-data

USER node
WORKDIR /app
ENV TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
