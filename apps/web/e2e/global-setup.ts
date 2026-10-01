import type { FullConfig } from '@playwright/test';

/** Fails fast with a clear message when the stack under test is not running. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  const healthUrl = process.env.E2E_HEALTH_URL ?? 'http://localhost:4000/health';
  for (const url of [healthUrl, `${baseURL}/admin`]) {
    const ok = await fetch(url).then(
      (response) => response.ok,
      () => false,
    );
    if (!ok) {
      throw new Error(`${url} is not reachable. Start the stack first: docker compose up --wait`);
    }
  }
}
