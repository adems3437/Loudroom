import { describe, expect, it } from 'vitest';
import type { AnyGameModule } from '../module.js';
import { playRound, type RoundFixture } from './harness.js';

export interface ContractFixture extends RoundFixture {
  /**
   * Variants of `content` that differ only in what must stay hidden until the round ends
   * (e.g. another correct answer). Until then, every client must see exactly the same thing
   * whichever variant is played — otherwise the secret is observable.
   */
  secretVariants: unknown[];
  /** Inputs the module must refuse, either by schema or with a reject effect. */
  invalidInputs: unknown[];
}

/**
 * The tests every game module must pass (SPEC §5): views match their schemas, nothing secret
 * leaks before the reveal, invalid input is refused, scoring is deterministic.
 */
export function describeGameModuleContract(module: AnyGameModule, fixture: ContractFixture): void {
  describe(`game module contract: ${module.id}`, () => {
    it('accepts its own fixture content and default settings', () => {
      expect(module.contentSchema.safeParse(fixture.content).success).toBe(true);
      expect(module.settingsSchema.safeParse(module.defaultSettings).success).toBe(true);
    });

    it('ends the scripted round', () => {
      expect(playRound(module, fixture).results).not.toBeNull();
    });

    it('produces views that match the view schemas in every phase', () => {
      for (const frame of playRound(module, fixture).frames) {
        expect(module.hostViewSchema.safeParse(frame.hostView).error).toBeUndefined();
        for (const view of Object.values(frame.playerViews)) {
          expect(module.playerViewSchema.safeParse(view).error).toBeUndefined();
        }
      }
    });

    it('leaks no secret to any client before the round ends', () => {
      expect(fixture.secretVariants.length).toBeGreaterThan(0);
      const beforeEnd = (content: unknown) =>
        playRound(module, { ...fixture, content }).frames.filter((frame) => !frame.ended);
      const reference = beforeEnd(fixture.content);
      expect(reference.length).toBeGreaterThan(0);
      for (const variant of fixture.secretVariants) {
        expect(module.contentSchema.safeParse(variant).success).toBe(true);
        expect(beforeEnd(variant)).toEqual(reference);
      }
    });

    it('refuses invalid input', () => {
      const { state, context } = playRound(module, fixture, { untilFirstInput: true });
      const playerId = fixture.players[0]?.id ?? 'nobody';
      for (const input of fixture.invalidInputs) {
        const parsed = module.inputSchema.safeParse(input);
        if (!parsed.success) continue;
        const next = module.onInput(
          state,
          parsed.data,
          { playerId, receivedAt: context().now },
          context(),
        );
        expect(next.effects).toContainEqual(expect.objectContaining({ type: 'reject', playerId }));
      }
    });

    it('creates and scores rounds deterministically', () => {
      const first = playRound(module, fixture);
      const second = playRound(module, fixture);
      expect(second.frames).toEqual(first.frames);
      expect(second.results).toEqual(first.results);
    });

    it('scores only players in the round, with whole non-negative points', () => {
      const ids = new Set(fixture.players.map((player) => player.id));
      for (const result of playRound(module, fixture).results ?? []) {
        expect(ids.has(result.playerId)).toBe(true);
        expect(Number.isInteger(result.points)).toBe(true);
        expect(result.points).toBeGreaterThanOrEqual(0);
      }
    });
  });
}
