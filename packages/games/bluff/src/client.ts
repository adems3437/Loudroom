import type { GameRenderer } from '@loudroom/game-sdk/client';
import { BluffEditor, emptyBluffContent, summarizeBluff } from './editor.js';
import { BluffHost } from './host.js';
import { BluffPlayer } from './player.js';
import {
  BLUFF_DEFAULT_SETTINGS,
  bluffContentSchema,
  bluffHostViewSchema,
  bluffPlayerViewSchema,
  bluffSettingsSchema,
  type BluffContent,
  type BluffHostView,
  type BluffPlayerView,
  type BluffSettings,
} from './schema.js';
import { BluffSettingsEditor } from './settings-editor.js';

export { BLUFF_GAME_TYPE } from './schema.js';

export const bluffRenderer: GameRenderer<
  BluffHostView,
  BluffPlayerView,
  BluffContent,
  BluffSettings
> = {
  hostViewSchema: bluffHostViewSchema,
  playerViewSchema: bluffPlayerViewSchema,
  Host: BluffHost,
  Player: BluffPlayer,
  editor: {
    contentSchema: bluffContentSchema,
    emptyContent: emptyBluffContent,
    summarize: summarizeBluff,
    Editor: BluffEditor,
  },
  settings: {
    settingsSchema: bluffSettingsSchema,
    defaultSettings: BLUFF_DEFAULT_SETTINGS,
    Editor: BluffSettingsEditor,
  },
};
