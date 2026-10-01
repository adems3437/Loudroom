import type { GameRenderer } from '@loudroom/game-sdk/client';
import { QuizHost } from './host.js';
import { QuizPlayer } from './player.js';
import {
  quizHostViewSchema,
  quizPlayerViewSchema,
  type QuizHostView,
  type QuizPlayerView,
} from './schema.js';

export { QUIZ_GAME_TYPE } from './schema.js';

export const quizRenderer: GameRenderer<QuizHostView, QuizPlayerView> = {
  hostViewSchema: quizHostViewSchema,
  playerViewSchema: quizPlayerViewSchema,
  Host: QuizHost,
  Player: QuizPlayer,
};
