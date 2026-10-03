import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Settings live in the repo-root .env. Variables already in the environment (Docker) win.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // no .env file — rely on the process environment
}

// Phones open the dev server through the LAN address in PUBLIC_URL; Next blocks dev assets for
// hosts that are not listed here.
const publicHost = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).hostname : undefined;

// The admin API and uploaded media are served on the page's own origin, so the admin session
// cookie can be SameSite=Strict and httpOnly (SPEC §9). Read when the config loads: `next dev`
// on start, `next build` at build time.
const apiUrl = (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\/$/, '');

const config: NextConfig = {
  // Production image: a self-contained server (docker/web.Dockerfile). The trace starts at the
  // repo root so the workspace packages are included.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  ...(publicHost ? { allowedDevOrigins: [publicHost] } : {}),
  rewrites: () =>
    Promise.resolve([
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/media/:path*', destination: `${apiUrl}/media/:path*` },
    ]),
};

export default withNextIntl(config);
