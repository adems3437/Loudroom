import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, lie, optionIds, players, vote, writes } from './fixtures.test-support.js';
import { bluffModule, revealStepMs, type BluffHostView, type BluffPlayerView } from './server.js';

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(bluffModule, { content, players, script, ...overrides });
}

type Phase<T, P> = Extract<T, { phase: P }>;
const hostAt = (frame: { hostView: unknown } | undefined) => frame?.hostView as BluffHostView;

describe('bluff round flow', () => {
  it('writes, votes and reveals, moving on as soon as everyone is done', () => {
    const id = optionIds(['Yedi', 'Sekiz', 'Dokuz']);
    const { frames, results } = play([
      ...writes('Yedi', 'Sekiz', 'Dokuz'),
      vote('p1', id('ÜÇ')),
      vote('p2', id('YEDİ')),
      vote('p3', id('YEDİ')),
      { type: 'timer' },
    ]);
    expect(frames.map((frame) => frame.phase)).toEqual([
      'INTRO',
      'WRITE',
      'WRITE',
      'WRITE',
      'VOTE',
      'VOTE',
      'VOTE',
      'REVEAL',
      'REVEAL',
    ]);
    expect(frames.at(-2)?.ended).toBe(false);
    expect(frames.at(-1)?.ended).toBe(true);
    expect(results).not.toBeNull();
  });

  it('moves on when the clocks run out, without waiting for everyone', () => {
    const { frames } = play([...writes('Yedi'), { type: 'timer' }, { type: 'timer' }]);
    expect(frames.map((frame) => frame.phase).slice(-3)).toEqual(['WRITE', 'VOTE', 'REVEAL']);
  });

  it('refuses lies too close to the real answer, blocked words, empty or long text', () => {
    const { rejects } = play(
      [
        { type: 'timer' },
        lie('p1', 'ÜÇ'),
        lie('p1', 'uc.'),
        lie('p1', '3'),
        lie('p1', 'küfürlü laf'),
        lie('p1', '   '),
        lie('p1', 'a'.repeat(41)),
        lie('p1', 'Yedi'),
        lie('p1', 'Sekiz'),
      ],
      { blockedWords: ['küfürlü'] },
    );
    expect(rejects.map((reject) => reject.code)).toEqual([
      'TOO_CLOSE',
      'TOO_CLOSE',
      'TOO_CLOSE',
      'TEXT_REJECTED',
      'INVALID_INPUT',
      'INVALID_INPUT',
      'ALREADY_ANSWERED',
    ]);
  });

  it('refuses votes outside voting, for unknown options, for one’s own lie and twice', () => {
    const early = play([...writes(), vote('p1', 'o1')]);
    expect(early.rejects).toEqual([{ type: 'reject', playerId: 'p1', code: 'ROUND_CLOSED' }]);

    const id = optionIds(['Yedi', 'Sekiz', 'Dokuz']);
    const { rejects } = play([
      ...writes('Yedi', 'Sekiz', 'Dokuz'),
      vote('p1', 'o99'),
      vote('p1', id('YEDİ')),
      vote('p1', id('SEKİZ')),
      vote('p1', id('DOKUZ')),
    ]);
    expect(rejects.map((reject) => reject.code)).toEqual([
      'INVALID_INPUT',
      'INVALID_INPUT',
      'ALREADY_ANSWERED',
    ]);
  });
});

describe('bluff options', () => {
  it('shows every option in upper case, merges identical lies, fills up with decoys', () => {
    const { frames } = play([...writes('yedi', 'Sekiz', 'sekiz!')]);
    const host = hostAt(frames.at(-1)) as Phase<BluffHostView, 'VOTE'>;
    const texts = host.options.map((option) => option.text);
    expect(texts).toHaveLength(4);
    expect(texts).toEqual(expect.arrayContaining(['ÜÇ', 'YEDİ', 'SEKİZ']));
    expect(texts.filter((text) => ['BİR', 'İKİ', 'DÖRT', 'ALTI'].includes(text))).toHaveLength(1);
    expect(host.options.map((option) => option.id).sort()).toEqual(['o1', 'o2', 'o3', 'o4']);
    const phone = frames.at(-1)?.playerViews.p3 as Phase<BluffPlayerView, 'VOTE'>;
    expect(phone.options.filter((option) => option.own).map((option) => option.text)).toEqual([
      'SEKİZ',
    ]);
  });

  it('turns a decoy someone also wrote into that player’s lie', () => {
    const { frames } = play([...writes('iki'), { type: 'timer' }], {
      settings: { minOptions: 5 },
    });
    const host = hostAt(frames.at(-1)) as Phase<BluffHostView, 'VOTE'>;
    expect(host.options.map((option) => option.text).sort()).toEqual(
      ['ALTI', 'BİR', 'DÖRT', 'İKİ', 'ÜÇ'].sort(),
    );
    const phone = frames.at(-1)?.playerViews.p1 as Phase<BluffPlayerView, 'VOTE'>;
    expect(phone.options.find((option) => option.text === 'İKİ')?.own).toBe(true);
  });

  it('never tells the truth, the authors or the votes before the reveal', () => {
    const id = optionIds(['Yedi', 'Sekiz', 'Dokuz']);
    const { frames } = play([
      ...writes('Yedi', 'Sekiz', 'Dokuz'),
      vote('p1', id('ÜÇ')),
      vote('p2', id('YEDİ')),
    ]);
    for (const frame of frames) {
      expect(JSON.stringify(frame)).not.toMatch(/truth|authors|voters|"kind"/);
    }
    expect(hostAt(frames.at(-1))).toMatchObject({ votedCount: 2, playerCount: 3 });
  });
});

describe('bluff scoring and reveal', () => {
  it('pays for the truth and for every player fooled; merged lies pay every author', () => {
    const id = optionIds(['Yedi', 'Sekiz', 'sekiz']);
    const { results } = play(
      [
        ...writes('Yedi', 'Sekiz', 'sekiz'),
        vote('p1', id('SEKİZ')),
        vote('p2', id('ÜÇ')),
        vote('p3', id('YEDİ')),
        { type: 'timer' },
      ],
      { scoreMultiplier: 2 },
    );
    expect(results?.map((result) => [result.playerId, result.points, result.correct])).toEqual([
      ['p1', 1000, false],
      ['p2', 2000 + 1000, true],
      ['p3', 1000, false],
    ]);
    expect(results?.[0]).toMatchObject({
      breakdown: { truth: 0, fooled: 1, fool: 1000 },
      answer: { lie: 'Yedi', optionId: id('SEKİZ') },
    });
  });

  it('reveals picked lies and decoys least picked first, then the truth, on a clock', () => {
    const id = optionIds(['Yedi']);
    const { frames } = play([
      ...writes('Yedi'),
      { type: 'timer' },
      vote('p1', id('ÜÇ')),
      vote('p2', id('YEDİ')),
      vote('p3', id('YEDİ')),
    ]);
    const host = hostAt(frames.at(-1)) as Phase<BluffHostView, 'REVEAL'>;
    expect(host.steps.map((step) => [step.text, step.kind, step.authors, step.voters])).toEqual([
      ['YEDİ', 'lie', ['p1'], ['p2', 'p3']],
      ['ÜÇ', 'truth', [], ['p1']],
    ]);
    expect(host).toMatchObject({ stepMs: 3_000, done: false });
    expect(frames.at(-1)?.playerViews.p2).toEqual({
      phase: 'REVEAL',
      question: content.question,
      done: false,
      truth: 'ÜÇ',
      lie: null,
      vote: id('YEDİ'),
      correct: false,
      fooled: [],
      fooledBy: ['p1'],
      pickedDecoy: false,
    });
    expect(frames.at(-1)?.playerViews.p1).toMatchObject({ fooled: ['p2', 'p3'], correct: true });
  });

  it('ends a skipped reveal with its scores, and leaves earlier skips to the engine', () => {
    const id = optionIds(['Yedi', 'Sekiz', 'Dokuz']);
    const voted = play([
      ...writes('Yedi', 'Sekiz', 'Dokuz'),
      vote('p1', id('ÜÇ')),
      vote('p2', id('YEDİ')),
      vote('p3', id('YEDİ')),
    ]);
    const skipped = bluffModule.onSkip?.(voted.state as never, voted.context() as never);
    expect(skipped?.effects).toEqual([{ type: 'endRound' }]);
    expect(
      bluffModule.getHostView(skipped?.state as never, voted.context() as never),
    ).toMatchObject({
      phase: 'REVEAL',
      done: true,
    });
    const writing = play([...writes('Yedi')]);
    expect(bluffModule.onSkip?.(writing.state as never, writing.context() as never)).toBeNull();
  });

  it('keeps long reveals short', () => {
    expect(revealStepMs(2)).toBe(3_000);
    expect(revealStepMs(12)).toBe(2_000);
    expect(revealStepMs(30)).toBe(1_500);
  });
});
