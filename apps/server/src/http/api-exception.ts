import { HttpException } from '@nestjs/common';
import type { ApiError, ApiErrorCode, ApiIssue } from '@loudroom/shared';
import type { z } from 'zod';

/** An expected REST failure; the body is always `{ code, message, issues? }` (ApiError). */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiIssue[],
  ) {
    const body: ApiError = { code, message, ...(issues ? { issues } : {}) };
    super(body, status);
  }
}

export function zodIssues(error: z.ZodError, prefix: (string | number)[] = []): ApiIssue[] {
  return error.issues.map((issue) => ({
    path: [...prefix, ...issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key))],
    code: issue.code,
    message: issue.message,
  }));
}

/** Parses a request body or query with a zod schema; failures become a 400 with the issues. */
export function parseRequest<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiException(400, 'VALIDATION_ERROR', 'Invalid request', zodIssues(result.error));
  }
  return result.data;
}

export const notFound = (what: string) => new ApiException(404, 'NOT_FOUND', `${what} not found`);
