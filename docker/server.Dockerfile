# syntax=docker/dockerfile:1
# Production server image (SPEC §13). Stages:
#   build    — the whole workspace with dev dependencies; built server and packages. Also the
#              `migrate` service of compose.prod.yml (Prisma CLI for `migrate deploy`).
#   runtime  — only the built server and its production dependencies, run as a non-root user.
#
# Behind a TLS-intercepting proxy, pass its CA as a build secret (docs/DEPLOY.md):
#   EXTRA_CA_CERTS=/path/to/ca.pem docker compose -f compose.yml -f compose.prod.yml build

ARG NODE_IMAGE=node:24-bookworm
ARG NODE_SLIM_IMAGE=node:24-bookworm-slim
# Static ffmpeg/ffprobe builds (video uploads); copied in, no package manager needed.
ARG FFMPEG_IMAGE=mwader/static-ffmpeg:7.1.1

FROM ${FFMPEG_IMAGE} AS ffmpeg

# Full Debian image: Prisma's migration engine needs OpenSSL, which the slim image lacks.
FROM ${NODE_IMAGE} AS build
ENV CI=true TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY docker/extra-ca.sh /usr/local/lib/extra-ca.sh
RUN --mount=type=secret,id=extra_ca \
  . /usr/local/lib/extra-ca.sh && npm install --global pnpm@12.8.1 && npm cache clean --force
COPY . .
RUN --mount=type=secret,id=extra_ca \
  . /usr/local/lib/extra-ca.sh && pnpm install --frozen-lockfile
# prisma.config.ts needs a DATABASE_URL to load; generating the client never connects.
RUN --mount=type=secret,id=extra_ca \
  . /usr/local/lib/extra-ca.sh \
  && DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm --filter @loudroom/server db:generate \
  && pnpm exec turbo run build --filter=@loudroom/server... \
  && pnpm --filter @loudroom/server deploy --prod --legacy --config.auto-install-peers=false /out \
  && cp -r apps/server/dist /out/dist \
  && rm -rf /out/src /out/test /out/scripts

FROM ${NODE_SLIM_IMAGE} AS runtime
ENV NODE_ENV=production MEDIA_DIR=/media-data SERVER_HOST=0.0.0.0 SERVER_PORT=4000
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
WORKDIR /app
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /media-data && chown node:node /media-data
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
