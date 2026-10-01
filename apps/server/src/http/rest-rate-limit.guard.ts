import {
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { RateLimiterService } from '../rate-limit/rate-limiter.service.js';
import { ApiException } from './api-exception.js';
import { requestAddressKey } from './request-address.js';

const UNTHROTTLED = Symbol('unthrottled');
/** Exempts a controller from REST throttling (health checks must work while Redis is down). */
export const Unthrottled = () => SetMetadata(UNTHROTTLED, true);

/** REST throttling per client IP (SPEC §9). Socket commands have their own buckets. */
@Injectable()
export class RestRateLimitGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimiter: RateLimiterService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    if (this.reflector.get<boolean | undefined>(UNTHROTTLED, context.getClass())) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const allowed = await this.rateLimiter.consume(
      'rest',
      requestAddressKey(request, this.config),
      this.config.rateLimits.rest,
    );
    if (!allowed) throw new ApiException(429, 'RATE_LIMITED', 'Too many requests');
    return true;
  }
}
