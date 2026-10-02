import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, media, MEDIA_ID, pins, players } from './fixtures.test-support.js';
import {
  imageLocationModule,
  type ImageLocationHostView,
  type ImageLocationPlayerView,
} from './server.js';

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(imageLocationModule, { content, media, players, script, ...overrides });
}

type Reveal<T> = Extract<T, { phase: 'REVEAL' }>;

describe('image location round flow', () => {
  it('shows the image with its size, then reveals once everyone pinned', () => {
    const { frames, results } = play(pins({ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0 }));
    expect(frames[0]?.hostView).toEqual({
      phase: 'INTRO',
      question: content.question,
      image: { mediaId: MEDIA_ID, width: 2000, height: 1000 },
    });
    expect(frames.at(-1)?.phase).toBe('REVEAL');
    expect(results).not.toBeNull();
  });

  it('assumes a square image when the size is unknown', () => {
    const { frames } = play([], { media: {} });
    expect(frames[0]?.hostView).toMatchObject({ image: { width: 1000, height: 1000 } });
  });

  it('keeps pins and the target off other screens until the reveal; pins are final', () => {
    const { frames, rejects } = play([
      ...pins({ x: 0.123, y: 0.456 }),
      { type: 'input', playerId: 'p1', input: { point: { x: 0.2, y: 0.2 } } },
    ]);
    expect(rejects).toEqual([{ type: 'reject', playerId: 'p1', code: 'ALREADY_ANSWERED' }]);
    for (const frame of frames) {
      expect(JSON.stringify([frame.hostView, frame.playerViews.p2])).not.toMatch(
        /0\.123|target|0\.4\b/,
      );
    }
    expect(frames.at(-1)?.playerViews.p1).toMatchObject({ pin: { x: 0.123, y: 0.456 } });
    expect(frames.at(-1)?.hostView).toMatchObject({ answeredCount: 1, playerCount: 3 });
  });
});

describe('image location scoring', () => {
  it('scores by aspect-corrected distance: full inside the radius, smooth down to zero', () => {
    const { results } = play(
      pins(
        { x: 0.41, y: 0.5 }, // 20 px of 2000 → 0.01, inside
        { x: 0.4, y: 0.665 }, // 165 px → 0.0825
        { x: 0.4, y: 0.1 }, // 400 px → 0.2
      ),
    );
    expect(results?.map((result) => [result.playerId, result.points, result.correct])).toEqual([
      ['p1', 1000, true],
      ['p2', 901, false],
      ['p3', 310, false],
    ]);
    expect(results?.[2]).toMatchObject({ breakdown: { distancePermille: 200 } });
  });

  it('uses the content radius for big targets and the pack multiplier', () => {
    const { results } = play([...pins({ x: 0.4, y: 0.665 }), { type: 'timer' }], {
      content: { ...content, radius: 0.1 },
      scoreMultiplier: 1.5,
    });
    expect(results?.[0]).toMatchObject({ points: 1500, correct: true });
  });

  it('scores missing pins as 0 when the time runs out', () => {
    const { results } = play([...pins({ x: 0.4, y: 0.5 }), { type: 'timer' }]);
    expect(results?.map((result) => result.correct)).toEqual([true, null, null]);
  });
});

describe('image location reveal', () => {
  it('shows the target, the ring and every pin, closest first', () => {
    const { frames } = play(pins({ x: 0.6, y: 0.5 }, { x: 0.4, y: 0.52 }, { x: 0.4, y: 0.5 }));
    const host = frames.at(-1)?.hostView as Reveal<ImageLocationHostView>;
    expect(host).toMatchObject({ target: content.target, radius: 0.03 });
    expect(host.pins.map((pin) => [pin.playerId, pin.inside])).toEqual([
      ['p3', true],
      ['p2', true],
      ['p1', false],
    ]);
    const phone = frames.at(-1)?.playerViews.p1 as Reveal<ImageLocationPlayerView>;
    expect(phone.distance).toBeCloseTo(0.2, 9);
    expect(phone).toMatchObject({
      pin: { x: 0.6, y: 0.5 },
      correct: false,
      rank: 3,
      answeredCount: 3,
    });
  });
});
