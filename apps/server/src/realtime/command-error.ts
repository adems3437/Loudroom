import type { ErrorCode } from '@loudroom/shared';

/** An expected command failure; becomes `{ ok: false, code, message }` in the ack. */
export class CommandError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}
