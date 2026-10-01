import { timingSafeEqual } from 'node:crypto';
import {
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CSRF_HEADER } from '@loudroom/shared';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { User } from '../generated/prisma/client.js';
import { ApiException } from '../http/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSessionStore, type StoredAdminSession } from './admin-session.store.js';

/** Session cookie: httpOnly, SameSite=Strict, Secure on HTTPS (SPEC §9). */
export const ADMIN_COOKIE = 'loudroom_admin';

export interface AdminContext {
  user: User;
  token: string;
  session: StoredAdminSession;
}

const contexts = new WeakMap<Request, AdminContext>();

const ADMIN_ONLY = Symbol('adminOnly');
/** Restricts a controller or route to the ADMIN role (user management, SPEC §9). */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

/** The logged-in admin of a request that passed AdminGuard. */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const admin = contexts.get(context.switchToHttp().getRequest<Request>());
  if (!admin) throw new Error('CurrentAdmin used on a route without AdminGuard');
  return admin;
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function sessionToken(request: Request): string | null {
  const value: unknown = (request.cookies as Record<string, unknown> | undefined)?.[ADMIN_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Unsafe requests must come from one of our own pages. Browsers always send Origin with them;
 * Referer is the fallback for older ones. A request with neither is refused.
 */
export function assertSameOrigin(request: Request, config: AppConfig): void {
  const origin = request.headers.origin ?? originOf(request.headers.referer);
  if (!origin || !config.corsOrigins.includes(origin)) {
    throw new ApiException(403, 'CSRF_FAILED', 'Request origin not allowed');
  }
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Admin API access: a live session (cookie), its CSRF token and an allowed Origin on unsafe
 * methods, and the ADMIN role where required. The user is reloaded on every request, so a
 * role change or deletion takes effect immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: AdminSessionStore,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = sessionToken(request);
    const session = token ? await this.sessions.touch(token) : null;
    if (!token || !session) throw new ApiException(401, 'UNAUTHENTICATED', 'Not logged in');

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      await this.sessions.destroy(token);
      throw new ApiException(401, 'UNAUTHENTICATED', 'Not logged in');
    }

    if (!SAFE_METHODS.has(request.method)) {
      assertSameOrigin(request, this.config);
      const header = request.headers[CSRF_HEADER];
      if (typeof header !== 'string' || !sameSecret(header, session.csrfToken)) {
        throw new ApiException(403, 'CSRF_FAILED', 'Missing or wrong CSRF token');
      }
    }

    const adminOnly = this.reflector.getAllAndOverride<boolean | undefined>(ADMIN_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (adminOnly && user.role !== 'ADMIN') {
      throw new ApiException(403, 'FORBIDDEN', 'Only admins can do this');
    }

    contexts.set(request, { user, token, session });
    return true;
  }
}
