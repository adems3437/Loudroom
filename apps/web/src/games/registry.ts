import type { GameRenderer } from '@loudroom/game-sdk/client';
import { QUIZ_GAME_TYPE, quizRenderer } from '@loudroom/game-quiz/client';

type AnyRenderer = GameRenderer<unknown, unknown>;

/**
 * Erases a renderer's view types for the registry. Safe because a view is always parsed with
 * the same renderer's schema before it reaches that renderer (see round-renderer.tsx).
 */
function erase<HostView, PlayerView>(renderer: GameRenderer<HostView, PlayerView>): AnyRenderer {
  return renderer as unknown as AnyRenderer;
}

/** gameType → screens (SPEC §5). Adding a game = its package + one line here. */
const RENDERERS: Record<string, AnyRenderer> = {
  [QUIZ_GAME_TYPE]: erase(quizRenderer),
};

export function findRenderer(gameType: string): AnyRenderer | undefined {
  return RENDERERS[gameType];
}
