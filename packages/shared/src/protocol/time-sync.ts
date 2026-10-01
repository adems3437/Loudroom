import { z } from 'zod';

export const timeSyncRequestSchema = z.strictObject({
  /** Client clock (epoch ms) when the request was sent; echoed back unchanged. */
  clientTime: z.number().nonnegative(),
});
export type TimeSyncRequest = z.infer<typeof timeSyncRequestSchema>;

export const timeSyncResponseSchema = z.strictObject({
  clientTime: z.number().nonnegative(),
  /** Server clock (epoch ms) when the request was handled. */
  serverTime: z.number().nonnegative(),
});
export type TimeSyncResponse = z.infer<typeof timeSyncResponseSchema>;
