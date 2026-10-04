import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyTombalaContent, summarizeTombala, TombalaEditor } from './editor.js';
import { TombalaHost } from './host.js';
import { TombalaPlayer } from './player.js';
import {
  TOMBALA_DEFAULT_SETTINGS,
  tombalaContentSchema,
  tombalaHostViewSchema,
  tombalaPlayerViewSchema,
  tombalaSettingsSchema,
  type TombalaContent,
  type TombalaHostView,
  type TombalaPlayerView,
  type TombalaSettings,
} from './schema.js';
import { TombalaSettingsEditor } from './settings-editor.js';

export { TOMBALA_GAME_TYPE } from './schema.js';

export const tombalaRenderer: GameRenderer<
  TombalaHostView,
  TombalaPlayerView,
  TombalaContent,
  TombalaSettings
> = {
  hostViewSchema: tombalaHostViewSchema,
  playerViewSchema: tombalaPlayerViewSchema,
  Host: TombalaHost,
  Player: TombalaPlayer,
  editor: {
    contentSchema: tombalaContentSchema,
    emptyContent: emptyTombalaContent,
    summarize: summarizeTombala,
    Editor: TombalaEditor,
  },
  settings: {
    settingsSchema: tombalaSettingsSchema,
    defaultSettings: TOMBALA_DEFAULT_SETTINGS,
    Editor: TombalaSettingsEditor,
  },
};
