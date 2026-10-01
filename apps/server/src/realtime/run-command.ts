import { Logger } from '@nestjs/common';
import { ackError, ackOk, type Ack } from '@loudroom/shared';
import { z } from 'zod';

const logger = new Logger('RealtimeCommand');

/**
 * Validates a command payload and turns the handler outcome into an ack. Never throws, so the
 * client always gets an answer instead of waiting for an ack that never comes.
 */
export function runCommand<S extends z.ZodType, R>(
  schema: S,
  payload: unknown,
  handler: (input: z.output<S>) => R,
): Ack<R> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return ackError('VALIDATION_ERROR', z.prettifyError(parsed.error));
  try {
    return ackOk(handler(parsed.data));
  } catch (error) {
    logger.error(error);
    return ackError('INTERNAL_ERROR', 'Unexpected server error');
  }
}
