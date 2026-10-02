import type { GameModule, RoundContext, ScoreResult, Transition } from '@loudroom/game-sdk';
import { imageLocationImporter } from './import.js';
import {
  IMAGE_LOCATION_DEFAULT_SETTINGS,
  IMAGE_LOCATION_GAME_TYPE,
  imageLocationContentSchema,
  imageLocationHostViewSchema,
  imageLocationInputSchema,
  imageLocationPlayerViewSchema,
  imageLocationSettingsSchema,
  type ImageLocationContent,
  type ImageLocationHostView,
  type ImageLocationInput,
  type ImageLocationPlayerView,
  type ImageLocationSettings,
  type ImagePointValue,
  type ImageView,
} from './schema.js';
import { imageDistance, locationShare, pointsFor } from './scoring.js';

export * from './schema.js';
export { imageLocationImporter } from './import.js';
export * from './scoring.js';

export type ImageLocationPhase = 'INTRO' | 'ANSWERING' | 'REVEAL';

interface Pin {
  point: ImagePointValue;
  /** Time taken since answering opened. */
  responseTimeMs: number;
}

export interface ImageLocationState {
  phase: ImageLocationPhase;
  pins: Record<string, Pin>;
}

type Ctx = RoundContext<ImageLocationContent, ImageLocationSettings>;

/** The image with its size from Media; a square is assumed if the size is unknown. */
function imageOf(ctx: Ctx): ImageView {
  const size = ctx.media[ctx.content.mediaId];
  return {
    mediaId: ctx.content.mediaId,
    width: size?.width ?? 1000,
    height: size?.height ?? 1000,
  };
}

function fullRadius(ctx: Ctx): number {
  return ctx.content.radius ?? ctx.settings.fullScoreRadius;
}

interface Ranked {
  playerId: string;
  pin: Pin;
  distance: number;
  inside: boolean;
}

/** Pins of players still in the room: closest first, ties by answer time, then join order. */
function ranking(state: ImageLocationState, ctx: Ctx): Ranked[] {
  const order = new Map(ctx.players.map((player, index) => [player.id, index]));
  const image = imageOf(ctx);
  const radius = fullRadius(ctx);
  return Object.entries(state.pins)
    .filter(([playerId]) => order.has(playerId))
    .map(([playerId, pin]) => {
      const distance = imageDistance(pin.point, ctx.content.target, image);
      return { playerId, pin, distance, inside: distance <= radius };
    })
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.pin.responseTimeMs - b.pin.responseTimeMs ||
        (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0),
    );
}

function answering(state: ImageLocationState, ctx: Ctx): Transition<ImageLocationState> {
  return {
    state: { ...state, phase: 'ANSWERING' },
    effects: [{ type: 'phase', phase: 'ANSWERING', durationMs: ctx.settings.timeLimitMs }],
  };
}

function reveal(state: ImageLocationState): Transition<ImageLocationState> {
  return {
    state: { ...state, phase: 'REVEAL' },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

export const imageLocationModule: GameModule<
  ImageLocationContent,
  ImageLocationSettings,
  ImageLocationState,
  ImageLocationInput,
  ImageLocationHostView,
  ImageLocationPlayerView
> = {
  id: IMAGE_LOCATION_GAME_TYPE,
  name: 'Image Location',
  version: 1,
  contentSchema: imageLocationContentSchema,
  settingsSchema: imageLocationSettingsSchema,
  defaultSettings: IMAGE_LOCATION_DEFAULT_SETTINGS,
  inputSchema: imageLocationInputSchema,
  hostViewSchema: imageLocationHostViewSchema,
  playerViewSchema: imageLocationPlayerViewSchema,
  capabilities: { minPlayers: 1, maxPlayers: 20 },
  importer: imageLocationImporter,

  createRound(ctx) {
    const state: ImageLocationState = { phase: 'INTRO', pins: {} };
    if (ctx.settings.introMs === 0) return answering(state, ctx);
    return {
      state,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    if (state.phase === 'INTRO') return answering(state, ctx);
    if (state.phase === 'ANSWERING') return reveal(state);
    return { state };
  },

  onInput(state, input, meta, ctx) {
    const reject = (code: 'ROUND_CLOSED' | 'ALREADY_ANSWERED' | 'INVALID_INPUT') => ({
      state,
      effects: [{ type: 'reject' as const, playerId: meta.playerId, code }],
    });
    if (state.phase !== 'ANSWERING') return reject('ROUND_CLOSED');
    if (!ctx.players.some((player) => player.id === meta.playerId)) return reject('INVALID_INPUT');
    if (state.pins[meta.playerId]) return reject('ALREADY_ANSWERED');

    const total = ctx.phase?.durationMs ?? ctx.settings.timeLimitMs;
    const endsAt = ctx.phase?.endsAt ?? meta.receivedAt;
    const remainingMs = Math.min(total, Math.max(0, endsAt - meta.receivedAt));
    const next: ImageLocationState = {
      ...state,
      pins: {
        ...state.pins,
        [meta.playerId]: { point: input.point, responseTimeMs: total - remainingMs },
      },
    };
    const connected = ctx.players.filter((player) => player.connected);
    if (connected.every((player) => next.pins[player.id] !== undefined)) return reveal(next);
    return { state: next };
  },

  score(state, ctx) {
    const ranked = ranking(state, ctx);
    return ctx.players.map((player): ScoreResult => {
      const entry = ranked.find((candidate) => candidate.playerId === player.id);
      if (!entry) {
        return {
          playerId: player.id,
          points: 0,
          correct: null,
          responseTimeMs: null,
          answer: null,
          breakdown: {},
        };
      }
      const share = locationShare(entry.distance, fullRadius(ctx), ctx.settings.zeroScoreDistance);
      const points = pointsFor(ctx.settings.baseScore, share, ctx.scoreMultiplier);
      return {
        playerId: player.id,
        points,
        correct: entry.inside,
        responseTimeMs: entry.pin.responseTimeMs,
        answer: { point: entry.pin.point },
        breakdown: { base: points, distancePermille: Math.round(entry.distance * 1000) },
      };
    });
  },

  getHostView(state, ctx) {
    const image = imageOf(ctx);
    const question = ctx.content.question;
    if (state.phase === 'INTRO') return { phase: 'INTRO', question, image };
    const ranked = ranking(state, ctx);
    const counts = {
      answeredCount: ranked.length,
      playerCount: ctx.players.filter((player) => player.connected).length,
    };
    if (state.phase === 'ANSWERING') return { phase: 'ANSWERING', question, image, ...counts };
    return {
      phase: 'REVEAL',
      question,
      image,
      ...counts,
      target: ctx.content.target,
      radius: fullRadius(ctx),
      pins: ranked.map((entry) => ({
        playerId: entry.playerId,
        point: entry.pin.point,
        distance: entry.distance,
        inside: entry.inside,
      })),
    };
  },

  getPlayerView(state, playerId, ctx) {
    const question = ctx.content.question;
    const image = imageOf(ctx);
    const pin = state.pins[playerId]?.point ?? null;
    if (state.phase === 'INTRO') return { phase: 'INTRO', question };
    if (state.phase === 'ANSWERING') return { phase: 'ANSWERING', question, image, pin };
    const ranked = ranking(state, ctx);
    const index = ranked.findIndex((entry) => entry.playerId === playerId);
    const mine = ranked[index];
    return {
      phase: 'REVEAL',
      question,
      image,
      target: ctx.content.target,
      radius: fullRadius(ctx),
      pin,
      distance: mine?.distance ?? null,
      correct: mine?.inside ?? null,
      rank: mine ? index + 1 : null,
      answeredCount: ranked.length,
    };
  },
};
