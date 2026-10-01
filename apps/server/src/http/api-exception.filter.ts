import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@loudroom/shared';
import type { Response } from 'express';
import { ApiException } from './api-exception.js';

const logger = new Logger('Http');

const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'MEDIA_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/**
 * Gives REST errors the ApiError shape. Exceptions Nest or multer raise on their own (unknown
 * route, oversized upload) are mapped by status; anything unexpected is a logged 500 that
 * reveals nothing.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const original = exception.getResponse();
      // A body chosen by the handler (e.g. the health report) is kept; Nest's own default
      // `{ statusCode, message }` bodies are mapped.
      if (typeof original === 'object' && !('statusCode' in original)) {
        response.status(status).json(original);
        return;
      }
      const body: ApiError = {
        code: CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR'),
        message: exception.message,
      };
      response.status(status).json(body);
      return;
    }
    logger.error(exception);
    const body: ApiError = { code: 'INTERNAL_ERROR', message: 'Internal error' };
    response.status(500).json(body);
  }
}
