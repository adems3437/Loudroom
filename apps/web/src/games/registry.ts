import type { GameRenderer } from '@loudroom/game-sdk/client';
import { BLUFF_GAME_TYPE, bluffRenderer } from '@loudroom/game-bluff/client';
import {
  CLOSEST_NUMBER_GAME_TYPE,
  closestNumberRenderer,
} from '@loudroom/game-closest-number/client';
import { DRAWING_GAME_TYPE, drawingRenderer } from '@loudroom/game-drawing/client';
import {
  IMAGE_LOCATION_GAME_TYPE,
  imageLocationRenderer,
} from '@loudroom/game-image-location/client';
import { MEMORY_GAME_TYPE, memoryRenderer } from '@loudroom/game-memory/client';
import { PISTI_GAME_TYPE, pistiRenderer } from '@loudroom/game-pisti/client';
import { QUIZ_GAME_TYPE, quizRenderer } from '@loudroom/game-quiz/client';
import { REACTION_GAME_TYPE, reactionRenderer } from '@loudroom/game-reaction/client';
import { SORTING_GAME_TYPE, sortingRenderer } from '@loudroom/game-sorting/client';
import { SPY_GAME_TYPE, spyRenderer } from '@loudroom/game-spy/client';
import { TOMBALA_GAME_TYPE, tombalaRenderer } from '@loudroom/game-tombala/client';
import { UNO_GAME_TYPE, unoRenderer } from '@loudroom/game-uno/client';
import { WHO_WOULD_GAME_TYPE, whoWouldRenderer } from '@loudroom/game-who-would/client';

type AnyRenderer = GameRenderer<unknown, unknown>;

/**
 * Erases a renderer's view and content types for the registry. Safe because views are parsed
 * with the same renderer's schema before they reach it (round-renderer.tsx), and an editor only
 * gets content the server validated with that game's schema or the game's own empty content
 * (settings likewise: the game's defaults with the round's stored changes on top).
 */
function erase<HostView, PlayerView, Content, Settings>(
  renderer: GameRenderer<HostView, PlayerView, Content, Settings>,
): AnyRenderer {
  return renderer as unknown as AnyRenderer;
}

/** gameType → screens (SPEC §5). Adding a game = its package + one line here. */
const RENDERERS: Record<string, AnyRenderer> = {
  [QUIZ_GAME_TYPE]: erase(quizRenderer),
  [CLOSEST_NUMBER_GAME_TYPE]: erase(closestNumberRenderer),
  [SORTING_GAME_TYPE]: erase(sortingRenderer),
  [WHO_WOULD_GAME_TYPE]: erase(whoWouldRenderer),
  [IMAGE_LOCATION_GAME_TYPE]: erase(imageLocationRenderer),
  [BLUFF_GAME_TYPE]: erase(bluffRenderer),
  [DRAWING_GAME_TYPE]: erase(drawingRenderer),
  [REACTION_GAME_TYPE]: erase(reactionRenderer),
  [MEMORY_GAME_TYPE]: erase(memoryRenderer),
  [TOMBALA_GAME_TYPE]: erase(tombalaRenderer),
  [SPY_GAME_TYPE]: erase(spyRenderer),
  [UNO_GAME_TYPE]: erase(unoRenderer),
  [PISTI_GAME_TYPE]: erase(pistiRenderer),
};

export function findRenderer(gameType: string): AnyRenderer | undefined {
  return RENDERERS[gameType];
}

/** Game types the admin panel can create content and pack rounds for. */
export const GAME_TYPES = Object.keys(RENDERERS);
