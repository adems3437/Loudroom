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

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(publicHost ? { allowedDevOrigins: [publicHost] } : {}),
};

export default withNextIntl(config);
