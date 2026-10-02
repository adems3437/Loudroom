import { describe, expect, it } from 'vitest';
import { emailSchema, loginRequestSchema, passwordSchema } from './auth.js';
import { categorySlugSchema, contentItemInputSchema, packInputSchema } from './content.js';

describe('admin contracts', () => {
  it('normalizes emails and enforces the password policy for new passwords only', () => {
    expect(emailSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('long enough!').success).toBe(true);
    // Logging in never checks the policy: old passwords keep working.
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('accepts only lowercase, dash-separated category slugs', () => {
    expect(categorySlugSchema.safeParse('genel-kultur').success).toBe(true);
    for (const slug of ['Genel', 'genel kültür', '-genel', 'genel--kultur', 'g']) {
      expect(categorySlugSchema.safeParse(slug).success).toBe(false);
    }
  });

  it('lowercases tags and bounds the default time limit', () => {
    const input = {
      gameType: 'quiz',
      data: {},
      categoryId: null,
      difficulty: 'EASY',
      tags: [' Uzay '],
      locale: 'tr',
      status: 'DRAFT',
      defaultTimeLimitMs: null,
      baseScore: 1000,
    };
    expect(contentItemInputSchema.parse(input).tags).toEqual(['uzay']);
    expect(contentItemInputSchema.safeParse({ ...input, defaultTimeLimitMs: 1000 }).success).toBe(
      false,
    );
  });

  it('describes pack rounds as a fixed list or a random draw', () => {
    const round = {
      gameType: 'quiz',
      questionCount: 5,
      timeLimitMs: null,
      scoreMultiplier: 1,
      showScoreboardAfter: true,
    };
    const pack = (contentSelection: unknown) => ({
      name: 'Paket',
      description: null,
      status: 'DRAFT',
      rounds: [{ ...round, contentSelection }],
    });
    expect(packInputSchema.safeParse(pack({ mode: 'random', difficulty: 'HARD' })).success).toBe(
      true,
    );
    expect(packInputSchema.safeParse(pack({ mode: 'fixed', contentIds: [] })).success).toBe(false);
    expect(packInputSchema.safeParse(pack({ mode: 'all' })).success).toBe(false);
  });

  it('keeps per-round game settings as an object, empty when left out', () => {
    const base = {
      gameType: 'quiz',
      contentSelection: { mode: 'random' },
      questionCount: 5,
      timeLimitMs: null,
      scoreMultiplier: 1,
      showScoreboardAfter: true,
    };
    const parse = (round: unknown) =>
      packInputSchema.safeParse({
        name: 'Paket',
        description: null,
        status: 'DRAFT',
        rounds: [round],
      });
    expect(parse(base).data?.rounds[0]?.settings).toEqual({});
    expect(parse({ ...base, settings: { baseScore: 500 } }).data?.rounds[0]?.settings).toEqual({
      baseScore: 500,
    });
    expect(parse({ ...base, settings: [1] }).success).toBe(false);
  });
});
