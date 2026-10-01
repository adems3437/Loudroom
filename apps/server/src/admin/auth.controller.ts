import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  type AdminSession,
} from '@loudroom/shared';
import type { CookieOptions, Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { ApiException, parseRequest } from '../http/api-exception.js';
import { requestAddressKey } from '../http/request-address.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashClientAddress } from '../rate-limit/client-address.js';
import { RateLimiterService } from '../rate-limit/rate-limiter.service.js';
import { AdminSessionStore } from './admin-session.store.js';
import {
  ADMIN_COOKIE,
  AdminGuard,
  assertSameOrigin,
  CurrentAdmin,
  type AdminContext,
} from './admin.guard.js';
import { toAdminUser } from './admin.views.js';
import { hashPassword, verifyNothing, verifyPassword } from './password.js';

@Controller('admin/auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly sessions: AdminSessionStore,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.admin.secureCookies,
      path: '/',
    };
  }

  /**
   * Strict limits (SPEC §9): attempts per IP, and failed attempts per account so a password
   * cannot be guessed from many addresses either. Both answer with the same RATE_LIMITED.
   */
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminSession> {
    assertSameOrigin(request, this.config);
    const { email, password } = parseRequest(loginRequestSchema, body);
    const limits = this.config.rateLimits;
    const accountKey = hashClientAddress(email, this.config.ipHashSecret);
    const allowed =
      (await this.rateLimiter.consume(
        'admin-login',
        requestAddressKey(request, this.config),
        limits.adminLogin,
      )) &&
      (await this.rateLimiter.hasCapacity(
        'admin-login-fail',
        accountKey,
        limits.adminLoginFailure,
      ));
    if (!allowed) throw new ApiException(429, 'RATE_LIMITED', 'Too many login attempts');

    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyNothing(password);
    if (!user || !valid) {
      await this.rateLimiter.consume('admin-login-fail', accountKey, limits.adminLoginFailure);
      throw new ApiException(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const { token, session } = await this.sessions.create(user.id);
    response.cookie(ADMIN_COOKIE, token, this.cookieOptions());
    return { user: toAdminUser(updated), csrfToken: session.csrfToken };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async logout(
    @CurrentAdmin() admin: AdminContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.destroy(admin.token);
    response.clearCookie(ADMIN_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: AdminContext): AdminSession {
    return { user: toAdminUser(admin.user), csrfToken: admin.session.csrfToken };
  }

  /** Changes the caller's own password and ends their other sessions. */
  @Post('password')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async changePassword(@CurrentAdmin() admin: AdminContext, @Body() body: unknown): Promise<void> {
    const { currentPassword, newPassword } = parseRequest(changePasswordRequestSchema, body);
    if (!(await verifyPassword(admin.user.passwordHash, currentPassword))) {
      throw new ApiException(400, 'WRONG_PASSWORD', 'The current password is wrong');
    }
    await this.prisma.user.update({
      where: { id: admin.user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.sessions.destroyAllForUser(admin.user.id, admin.token);
  }
}
