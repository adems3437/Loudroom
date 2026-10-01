import { randomUUID } from 'node:crypto';
import { CSRF_HEADER, type AdminSession } from '@loudroom/shared';
import sharp from 'sharp';
import { hashPassword } from '../src/admin/password.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

/** The browser origin the test app accepts (PUBLIC_URL in startTestApp). */
export const PAGE_ORIGIN = 'http://localhost:3000';

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

/**
 * Talks to the admin API like the panel does: keeps the session cookie, sends the CSRF token on
 * unsafe requests and the page's Origin. Each part can be left out to test the protections.
 */
export class AdminClient {
  cookie: string | null = null;
  csrfToken: string | null = null;

  constructor(private readonly baseUrl: string) {}

  async request<T = unknown>(
    method: string,
    path: string,
    options: {
      json?: unknown;
      form?: FormData;
      origin?: string | null;
      csrf?: boolean;
    } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    const origin = options.origin === undefined ? PAGE_ORIGIN : options.origin;
    if (origin) headers.origin = origin;
    if (this.cookie) headers.cookie = this.cookie;
    if (method !== 'GET' && options.csrf !== false && this.csrfToken) {
      headers[CSRF_HEADER] = this.csrfToken;
    }
    let body: string | FormData | undefined;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form) {
      body = options.form;
    }
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0] ?? '';
      this.cookie = pair.endsWith('=') ? null : pair;
    }
    const text = await response.text();
    const type = response.headers.get('content-type') ?? '';
    return {
      status: response.status,
      body: (type.includes('json') && text ? JSON.parse(text) : text) as T,
      headers: response.headers,
    };
  }

  async login(email: string, password: string): Promise<ApiResponse<AdminSession>> {
    const response = await this.request<AdminSession>('POST', '/api/admin/auth/login', {
      json: { email, password },
    });
    if (response.status === 200) this.csrfToken = response.body.csrfToken;
    return response;
  }
}

export const TEST_PASSWORD = 'correct horse battery';

export async function createUser(
  prisma: PrismaClient,
  role: 'ADMIN' | 'EDITOR',
): Promise<{ id: string; email: string }> {
  const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`;
  const user = await prisma.user.create({
    data: { email, displayName: role, role, passwordHash: await hashPassword(TEST_PASSWORD) },
  });
  return { id: user.id, email };
}

export async function loggedIn(
  baseUrl: string,
  prisma: PrismaClient,
  role: 'ADMIN' | 'EDITOR' = 'ADMIN',
): Promise<AdminClient & { userId: string }> {
  const user = await createUser(prisma, role);
  const client = new AdminClient(baseUrl);
  const response = await client.login(user.email, TEST_PASSWORD);
  if (response.status !== 200) throw new Error(`login failed: ${response.status}`);
  return Object.assign(client, { userId: user.id });
}

/** A small JPEG carrying EXIF data that must not survive the upload. */
export function jpegWithExif(width = 40, height = 30): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#ff4d6d' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'secret-location', Artist: 'test' } })
    .toBuffer();
}

export function uploadForm(data: Buffer, name: string, altText?: string): FormData {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)]), name);
  if (altText !== undefined) form.append('altText', altText);
  return form;
}

export function quizData(tag: string, mediaId?: string) {
  return {
    question: `Admin sorusu ${tag}`,
    options: [
      { id: 'a', text: 'Bir' },
      { id: 'b', text: 'İki' },
    ],
    correctOptionId: 'b',
    ...(mediaId ? { media: { type: 'image', mediaId } } : {}),
  };
}

export function contentInput(data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    gameType: 'quiz',
    data,
    categoryId: null,
    difficulty: 'MEDIUM',
    tags: [],
    locale: 'tr',
    status: 'PUBLISHED',
    defaultTimeLimitMs: null,
    baseScore: 1000,
    ...overrides,
  };
}

export function packInput(contentIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    name: `Paket ${randomUUID().slice(0, 6)}`,
    description: null,
    status: 'PUBLISHED',
    rounds: [
      {
        gameType: 'quiz',
        contentSelection: { mode: 'fixed', contentIds },
        questionCount: contentIds.length,
        timeLimitMs: 10_000,
        scoreMultiplier: 1,
        showScoreboardAfter: true,
      },
    ],
    ...overrides,
  };
}
