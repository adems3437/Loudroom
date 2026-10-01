import {
  ClientCommand,
  TIME_SYNC_SAMPLE_COUNT,
  ackSchema,
  bestClockEstimate,
  timeSyncResponseSchema,
  type ClockEstimate,
  type ClockSample,
} from '@loudroom/shared';
import type { AppSocket } from './socket';

const SAMPLE_TIMEOUT_MS = 3000;
const timeSyncAckSchema = ackSchema(timeSyncResponseSchema);

/** Epoch milliseconds from a monotonic clock, unaffected by wall-clock adjustments. */
export function clientNow(): number {
  return performance.timeOrigin + performance.now();
}

/** Runs a few `time:sync` round trips and keeps the most reliable estimate. */
export async function measureClock(socket: AppSocket): Promise<ClockEstimate | null> {
  const samples: ClockSample[] = [];
  for (let i = 0; i < TIME_SYNC_SAMPLE_COUNT && socket.connected; i++) {
    const clientSentAt = clientNow();
    try {
      const response: unknown = await socket
        .timeout(SAMPLE_TIMEOUT_MS)
        .emitWithAck(ClientCommand.TimeSync, { clientTime: clientSentAt });
      const clientReceivedAt = clientNow();
      const result = timeSyncAckSchema.safeParse(response);
      if (result.success && result.data.ok) {
        samples.push({ clientSentAt, serverTime: result.data.data.serverTime, clientReceivedAt });
      }
    } catch {
      // Timed out or disconnected mid-sample: the remaining samples still count.
    }
  }
  return bestClockEstimate(samples);
}
