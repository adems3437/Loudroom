# syntax=docker/dockerfile:1
# Production web image (SPEC §13): Next.js standalone output, run as a non-root user.
# Behind a TLS-intercepting proxy, pass its CA as a build secret (see server.Dockerfile).

ARG NODE_IMAGE=node:24-bookworm
ARG NODE_SLIM_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV CI=true TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
# Where Next forwards /api and /media when nothing else does (development); in production
# Nginx routes them to the server first. Read at build time.
ARG API_INTERNAL_URL=http://server:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
WORKDIR /repo
COPY docker/extra-ca.sh /usr/local/lib/extra-ca.sh
RUN --mount=type=secret,id=extra_ca \
  . /usr/local/lib/extra-ca.sh && npm install --global pnpm@12.8.1 && npm cache clean --force
COPY . .
RUN --mount=type=secret,id=extra_ca \
  . /usr/local/lib/extra-ca.sh && pnpm install --frozen-lockfile
# The build downloads the Google fonts (next/font), so it needs the CA too behind a proxy.
# pnpm (not turbo) runs the builds in dependency order: turbo's strict environment mode would
# hide the CA variables from the build.
RUN --mount=type=secret,id=extra_ca \
  . /usr/local/lib/extra-ca.sh && pnpm --filter @loudroom/web... run build

FROM ${NODE_SLIM_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/play').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
