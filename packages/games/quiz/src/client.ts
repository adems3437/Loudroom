import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyQuizContent, QuizEditor, summarizeQuiz } from './editor.js';
import { QuizHost } from './host.js';
import { QuizPlayer } from './player.js';
import { QuizSettingsEditor } from './settings-editor.js';
import {
  QUIZ_DEFAULT_SETTINGS,
  quizContentSchema,
  quizHostViewSchema,
  quizPlayerViewSchema,
  quizSettingsSchema,
  type QuizContent,
  type QuizHostView,
  type QuizPlayerView,
  type QuizSettings,
} from './schema.js';

export { QUIZ_GAME_TYPE } from './schema.js';

export const quizRenderer: GameRenderer<QuizHostView, QuizPlayerView, QuizContent, QuizSettings> = {
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
  settings: {
    settingsSchema: quizSettingsSchema,
    defaultSettings: QUIZ_DEFAULT_SETTINGS,
    Editor: QuizSettingsEditor,
  },
};
