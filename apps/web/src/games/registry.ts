import type { GameRenderer } from '@loudroom/game-sdk/client';
import { QUIZ_GAME_TYPE, quizRenderer } from '@loudroom/game-quiz/client';

type AnyRenderer = GameRenderer<unknown, unknown>;

/**
 * Erases a renderer's view and content types for the registry. Safe because views are parsed
 * with the same renderer's schema before they reach it (round-renderer.tsx), and an editor only
 * gets content the server validated with that game's schema or the game's own empty content.
 */
function erase<HostView, PlayerView, Content>(
  renderer: GameRenderer<HostView, PlayerView, Content>,
): AnyRenderer {
  return renderer as unknown as AnyRenderer;
}

/** gameType → screens (SPEC §5). Adding a game = its package + one line here. */
const RENDERERS: Record<string, AnyRenderer> = {
  [QUIZ_GAME_TYPE]: erase(quizRenderer),
};

export function findRenderer(gameType: string): AnyRenderer | undefined {
  return RENDERERS[gameType];
}

/** Game types the admin panel can create content and pack rounds for. */
export const GAME_TYPES = Object.keys(RENDERERS);
