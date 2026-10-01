import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyQuizContent, QuizEditor, summarizeQuiz } from './editor.js';
import { QuizHost } from './host.js';
import { QuizPlayer } from './player.js';
import {
  quizContentSchema,
  quizHostViewSchema,
  quizPlayerViewSchema,
  type QuizContent,
  type QuizHostView,
  type QuizPlayerView,
} from './schema.js';

export { QUIZ_GAME_TYPE } from './schema.js';

export const quizRenderer: GameRenderer<QuizHostView, QuizPlayerView, QuizContent> = {
  hostViewSchema: quizHostViewSchema,
  playerViewSchema: quizPlayerViewSchema,
  Host: QuizHost,
  Player: QuizPlayer,
  editor: {
    contentSchema: quizContentSchema,
    emptyContent: emptyQuizContent,
    summarize: summarizeQuiz,
    Editor: QuizEditor,
  },
};
