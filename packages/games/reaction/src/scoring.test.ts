import { describe, expect, it } from 'vitest';
import { median, plausibleTap } from './scoring.js';

describe('median', () => {
  it.each([
    [[300], 300],
    [[300, 200, 900], 300],
    [[200, 300, 400, 1500], 350],
    [[250.4, 250.4, 250.4], 250],
  ])('%j → %i', (values, result) => {
    expect(median(values)).toBe(result);
  });
});

describe('plausibleTap', () => {
  const base = {
    reactionMs: 250,
    goAt: 1_000,
    shownAt: 1_080,
    tapAt: 1_340,
    minReactionMs: 100,
    maxReactionMs: 1_500,
  };

  it('accepts a tap whose messages arrived about as far apart as it measured', () => {
    expect(plausibleTap(base)).toBe('ok');
    expect(plausibleTap({ ...base, tapAt: 1_080 + 250 + 290 })).toBe('ok');
  });

  it('refuses impossible speed, a missing or late "shown", and a gap that does not match', () => {
    expect(plausibleTap({ ...base, reactionMs: 80, tapAt: 1_160 })).toBe('invalid');
    expect(plausibleTap({ ...base, shownAt: null })).toBe('invalid');
    expect(plausibleTap({ ...base, shownAt: 2_600, tapAt: 2_850 })).toBe('invalid');
    expect(plausibleTap({ ...base, tapAt: 1_080 + 250 + 400 })).toBe('invalid');
    expect(plausibleTap({ ...base, reactionMs: 150, tapAt: 1_080 + 600 })).toBe('invalid');
  });

  it('counts a plausible but too slow tap as a miss', () => {
    expect(plausibleTap({ ...base, reactionMs: 1_600, tapAt: 1_080 + 1_600 })).toBe('missed');
  });
});
