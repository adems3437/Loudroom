import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ackError, ackOk, ackSchema } from './ack.js';
import { ClientCommand, clientCommandSchemas } from './events.js';
import { timeSyncRequestSchema, timeSyncResponseSchema } from './time-sync.js';

describe('ack envelope', () => {
  const schema = ackSchema(z.object({ value: z.number() }));

  it('accepts success and error results', () => {
    expect(schema.parse(ackOk({ value: 1 }))).toEqual({ ok: true, data: { value: 1 } });
    expect(schema.parse(ackError('VALIDATION_ERROR', 'bad'))).toEqual({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'bad',
    });
  });

  it('rejects unknown error codes and malformed success payloads', () => {
    expect(schema.safeParse({ ok: false, code: 'NOPE', message: 'x' }).success).toBe(false);
    expect(schema.safeParse({ ok: true, data: { value: 'x' } }).success).toBe(false);
  });
});

describe('time:sync schemas', () => {
  it('is the registered schema for the time:sync command', () => {
    expect(clientCommandSchemas[ClientCommand.TimeSync]).toBe(timeSyncRequestSchema);
  });

  it('accepts a valid request', () => {
    expect(timeSyncRequestSchema.parse({ clientTime: 1_700_000_000_000 })).toEqual({
      clientTime: 1_700_000_000_000,
    });
  });

  it.each([
    {},
    { clientTime: -1 },
    { clientTime: 'now' },
    { clientTime: Number.POSITIVE_INFINITY },
    { clientTime: 1, serverTime: 2 },
  ])('rejects invalid request %j', (payload) => {
    expect(timeSyncRequestSchema.safeParse(payload).success).toBe(false);
  });

  it('accepts a valid response', () => {
    expect(timeSyncResponseSchema.safeParse({ clientTime: 1, serverTime: 2 }).success).toBe(true);
  });
});
