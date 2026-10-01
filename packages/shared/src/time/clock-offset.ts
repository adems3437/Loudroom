/** One round trip of `time:sync`, all values epoch ms. */
export interface ClockSample {
  clientSentAt: number;
  serverTime: number;
  clientReceivedAt: number;
}

export interface ClockEstimate {
  /** serverClock − clientClock. Add to a local timestamp to get server time. */
  offsetMs: number;
  rttMs: number;
}

export const TIME_SYNC_SAMPLE_COUNT = 5;
export const TIME_SYNC_INTERVAL_MS = 30_000;

/** NTP-style estimate assuming the request and response legs take equally long. */
export function estimateFromSample(sample: ClockSample): ClockEstimate | null {
  const rttMs = sample.clientReceivedAt - sample.clientSentAt;
  if (!Number.isFinite(rttMs) || rttMs < 0) return null;
  const offsetMs = sample.serverTime - (sample.clientSentAt + rttMs / 2);
  return { offsetMs, rttMs };
}

/**
 * Picks the estimate from the sample with the lowest round trip: the shorter the round trip,
 * the less room for asymmetric delay, so its offset is the most trustworthy.
 */
export function bestClockEstimate(samples: readonly ClockSample[]): ClockEstimate | null {
  let best: ClockEstimate | null = null;
  for (const sample of samples) {
    const estimate = estimateFromSample(sample);
    if (estimate && (best === null || estimate.rttMs < best.rttMs)) best = estimate;
  }
  return best;
}
