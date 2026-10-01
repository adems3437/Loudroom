import { defineConfig, env } from 'prisma/config';

// Outside Docker the variables come from the repo-root .env; inside Docker they are already set.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // no .env file — rely on the process environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
