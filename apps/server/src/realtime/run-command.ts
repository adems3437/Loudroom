import { Logger } from '@nestjs/common';
import { ackError, ackOk, type Ack } from '@loudroom/shared';
import { z } from 'zod';
import { CommandError } from './command-error.js';

const logger = new Logger('RealtimeCommand');

/**
 * Validates a command payload and turns the handler outcome into an ack. Never throws, so the
 * client always gets an answer instead of waiting for an ack that never comes.
 */
export async function runCommand<S extends z.ZodType, R>(
  schema: S,
  payload: unknown,
  handler: (input: z.output<S>) => R | Promise<R>,
): Promise<Ack<R>> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return ackError('VALIDATION_ERROR', z.prettifyError(parsed.error));
  try {
    return ackOk(await handler(parsed.data));
  } catch (error) {
    if (error instanceof CommandError) return ackError(error.code, error.message);
    logger.error(error);
    return ackError('INTERNAL_ERROR', 'Unexpected server error');
  }
}
