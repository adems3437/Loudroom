import { describe, expect, it } from 'vitest';
import { bestClockEstimate, estimateFromSample } from './clock-offset.js';

describe('estimateFromSample', () => {
  it('computes offset from the midpoint of the round trip', () => {
    // Client sends at 1000, server (500 ms ahead) answers at 1550, client receives at 1100.
    expect(
      estimateFromSample({ clientSentAt: 1000, serverTime: 1550, clientReceivedAt: 1100 }),
    ).toEqual({ offsetMs: 500, rttMs: 100 });
  });

  it('handles a server clock that is behind the client', () => {
    expect(
      estimateFromSample({ clientSentAt: 5000, serverTime: 3020, clientReceivedAt: 5040 }),
    ).toEqual({ offsetMs: -2000, rttMs: 40 });
  });

  it('rejects samples whose round trip is negative or not finite', () => {
    expect(estimateFromSample({ clientSentAt: 10, serverTime: 5, clientReceivedAt: 9 })).toBeNull();
    expect(
      estimateFromSample({ clientSentAt: 10, serverTime: 5, clientReceivedAt: Number.NaN }),
    ).toBeNull();
  });
});

describe('bestClockEstimate', () => {
  it('returns null without usable samples', () => {
    expect(bestClockEstimate([])).toBeNull();
    expect(
      bestClockEstimate([{ clientSentAt: 10, serverTime: 5, clientReceivedAt: 9 }]),
    ).toBeNull();
  });

  it('uses the sample with the lowest round trip', () => {
    const estimate = bestClockEstimate([
      { clientSentAt: 0, serverTime: 400, clientReceivedAt: 300 }, // rtt 300, skewed
      { clientSentAt: 1000, serverTime: 1270, clientReceivedAt: 1040 }, // rtt 40
      { clientSentAt: 2000, serverTime: 2300, clientReceivedAt: 2120 }, // rtt 120
      { clientSentAt: 3000, serverTime: 2000, clientReceivedAt: 2999 }, // invalid
    ]);
    expect(estimate).toEqual({ offsetMs: 250, rttMs: 40 });
  });
});
