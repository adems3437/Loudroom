import { z } from 'zod';

/** Error codes a command ack can carry. */
export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
  'RATE_LIMITED',
  'FORBIDDEN',
  'NOT_IN_ROOM',
  'ALREADY_IN_ROOM',
  'ROOM_NOT_FOUND',
  'ROOM_LOCKED',
  'ROOM_FULL',
  'NICKNAME_TAKEN',
  'NICKNAME_REJECTED',
  'PLAYER_NOT_FOUND',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const ackErrorSchema = z.object({
  ok: z.literal(false),
  code: errorCodeSchema,
  message: z.string(),
});
export type AckError = z.infer<typeof ackErrorSchema>;

export interface AckOk<T> {
  ok: true;
  data: T;
}

/** Every client → server command answers through its ack callback with this shape. */
export type Ack<T> = AckOk<T> | AckError;

export function ackSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), data }), ackErrorSchema]);
}

export function ackOk<T>(data: T): AckOk<T> {
  return { ok: true, data };
}

export function ackError(code: ErrorCode, message: string): AckError {
  return { ok: false, code, message };
}
