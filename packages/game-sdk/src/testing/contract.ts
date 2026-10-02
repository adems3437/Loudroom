import { describe, expect, it } from 'vitest';
import type { AnyGameModule } from '../module.js';
import { playRound, type Frame, type RoundFixture, type ScriptStep } from './harness.js';

export interface ContractFixture extends RoundFixture {
  /**
   * Variants of `content` that differ only in what must stay hidden until the round ends
   * (e.g. another correct answer). Until then, every client must see exactly the same thing
   * whichever variant is played — otherwise the secret is observable.
   */
  secretVariants?: unknown[];
  /**
   * Variants of `script` with the same players acting at the same moments, but choosing
   * differently. Until the round ends, the host and every player whose own inputs did not
   * change must see exactly the same thing — otherwise one player's choice leaks to others.
   * A variant may also change the content: e.g. a Bluff answer swapped with a player's lie
   * shows that nothing tells the real answer apart from the lies.
   */
  secretScripts?: (ScriptStep[] | SecretCase)[];
  /**
   * Variants of `script` that give the same overall result (e.g. the same vote counts) from
   * different players. Even after the round ends, the host and every player whose own inputs did
   * not change must see the same thing, and get the same score — choices stay anonymous.
   */
  anonymousScripts?: ScriptStep[][];
  /**
   * The phase from which secrets may be shown, for games whose reveal is a timed phase before
   * the round ends (Bluff). Without it, secrets must hold until the round ends.
   */
  revealPhase?: string;
  /**
   * Who may know the secrets: players (e.g. the drawer and the word) and/or `'host'` (e.g. a
   * TV that shows every player's result live). Their views are left out of the secrecy
   * comparisons; everyone else's are not.
   */
  secretHolders?: string[];
  /** Inputs the module must refuse, either by schema or with a reject effect. */
  invalidInputs: unknown[];
}

/** A secret script played with other content. */
export interface SecretCase {
  content: unknown;
  script: ScriptStep[];
}

/** When and by whom each step happens, without what was chosen. */
function timing(script: ScriptStep[]) {
  return script.map((step) =>
    step.type === 'timer'
      ? step
      : { type: step.type, playerId: step.playerId, afterMs: step.afterMs ?? 0 },
  );
}

/** A player's inputs in a script, as JSON (inputs are plain JSON values). */
function inputsOf(script: ScriptStep[], playerId: string): string {
  return JSON.stringify(
    script.flatMap((step) =>
      step.type === 'input' && step.playerId === playerId ? [step.input] : [],
    ),
  );
}

/** Frames shown before anything may be revealed. */
function hidden(frames: Frame[], revealPhase: string | undefined): Frame[] {
  const until = frames.findIndex(
    (frame) => frame.ended || (revealPhase !== undefined && frame.phase === revealPhase),
  );
  return until === -1 ? frames : frames.slice(0, until);
}

/** What the host (unless it may know the secrets) and the given players were shown. */
function seenBy(frames: Frame[], playerIds: string[], holders: readonly string[] = []) {
  return frames.map((frame) => ({
    phase: frame.phase,
    ended: frame.ended,
    hostView: holders.includes('host') ? null : frame.hostView,
    playerViews: playerIds.filter((id) => !holders.includes(id)).map((id) => frame.playerViews[id]),
  }));
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

    it('declares what must stay secret', () => {
      const declared = (fixture.secretVariants?.length ?? 0) + (fixture.secretScripts?.length ?? 0);
      expect(declared).toBeGreaterThan(0);
    });

    it.runIf(fixture.secretVariants?.length)(
      'leaks no secret content to any client before the round ends',
      () => {
        const others = fixture.players
          .map((player) => player.id)
          .filter((id) => !(fixture.secretHolders ?? []).includes(id));
        const beforeEnd = (content: unknown) =>
          seenBy(
            hidden(playRound(module, { ...fixture, content }).frames, fixture.revealPhase),
            others,
            fixture.secretHolders,
          );
        const reference = beforeEnd(fixture.content);
        expect(reference.length).toBeGreaterThan(0);
        for (const variant of fixture.secretVariants ?? []) {
          expect(module.contentSchema.safeParse(variant).success).toBe(true);
          expect(beforeEnd(variant)).toEqual(reference);
        }
      },
    );

    it.runIf(fixture.secretScripts?.length)(
      "leaks no player's input to others before the round ends",
      () => {
        const reference = playRound(module, fixture).frames;
        for (const variant of fixture.secretScripts ?? []) {
          const { content, script } = Array.isArray(variant)
            ? { content: fixture.content, script: variant }
            : variant;
          expect(module.contentSchema.safeParse(content).success).toBe(true);
          expect(timing(script)).toEqual(timing(fixture.script));
          const unchanged = fixture.players
            .map((player) => player.id)
            .filter((id) => inputsOf(script, id) === inputsOf(fixture.script, id));
          const frames = playRound(module, { ...fixture, content, script }).frames;
          const beforeEnd = (list: Frame[]) => hidden(list, fixture.revealPhase);
          expect(seenBy(beforeEnd(frames), unchanged, fixture.secretHolders)).toEqual(
            seenBy(beforeEnd(reference), unchanged, fixture.secretHolders),
          );
        }
      },
    );

    it.runIf(fixture.anonymousScripts?.length)(
      'keeps choices anonymous, also after the round',
      () => {
        const reference = playRound(module, fixture);
        expect(reference.results).not.toBeNull();
        for (const script of fixture.anonymousScripts ?? []) {
          expect(timing(script)).toEqual(timing(fixture.script));
          const unchanged = fixture.players
            .map((player) => player.id)
            .filter((id) => inputsOf(script, id) === inputsOf(fixture.script, id));
          expect(unchanged.length).toBeLessThan(fixture.players.length);
          const played = playRound(module, { ...fixture, script });
          expect(seenBy(played.frames, unchanged)).toEqual(seenBy(reference.frames, unchanged));
          const scoresOf = (results: typeof played.results) =>
            (results ?? []).filter((result) => unchanged.includes(result.playerId));
          expect(scoresOf(played.results)).toEqual(scoresOf(reference.results));
        }
      },
    );

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
