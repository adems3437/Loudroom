import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { PhaseClock } from '../module.js';

/** Translates a key under the game's own message namespace (`games.<id>.*` in the web app). */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface RendererPlayer {
  id: string;
  nickname: string;
  avatar: string;
  color: string;
  connected: boolean;
}

interface RendererBase<View> {
  view: View;
  /** The round's current phase clock from the server. */
  phase: PhaseClock | null;
  /** Current server time (client clock corrected by the measured offset, SPEC §3). */
  serverNow: () => number;
  players: readonly RendererPlayer[];
  t: Translate;
}

export type HostRendererProps<View> = RendererBase<View>;

export type SubmitOutcome = { ok: true } | { ok: false; code: string };

export interface PlayerRendererProps<View> extends RendererBase<View> {
  playerId: string;
  /** Sends a round input; resolves with the server's verdict. */
  submit: (input: unknown) => Promise<SubmitOutcome>;
  /** Short tap feedback (vibration where supported). */
  haptic: () => void;
}

/** What the web registry holds per game type (SPEC §5: gameType → renderer). */
export interface GameRenderer<HostView, PlayerView> {
  hostViewSchema: z.ZodType<HostView>;
  playerViewSchema: z.ZodType<PlayerView>;
  Host: ComponentType<HostRendererProps<HostView>>;
  Player: ComponentType<PlayerRendererProps<PlayerView>>;
}
