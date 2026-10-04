import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyAmiralContent, summarizeAmiral, AmiralEditor } from './editor.js';
import { AmiralHost } from './host.js';
import { AmiralPlayer } from './player.js';
import {
  AMIRAL_DEFAULT_SETTINGS,
  amiralContentSchema,
  amiralHostViewSchema,
  amiralPlayerViewSchema,
  amiralSettingsSchema,
  type AmiralContent,
  type AmiralHostView,
  type AmiralPlayerView,
  type AmiralSettings,
} from './schema.js';
import { AmiralSettingsEditor } from './settings-editor.js';

export { AMIRAL_GAME_TYPE } from './schema.js';

export const amiralRenderer: GameRenderer<
  AmiralHostView,
  AmiralPlayerView,
  AmiralContent,
  AmiralSettings
> = {
  hostViewSchema: amiralHostViewSchema,
  playerViewSchema: amiralPlayerViewSchema,
  Host: AmiralHost,
  Player: AmiralPlayer,
  editor: {
    contentSchema: amiralContentSchema,
    emptyContent: emptyAmiralContent,
    summarize: summarizeAmiral,
    Editor: AmiralEditor,
  },
  settings: {
    settingsSchema: amiralSettingsSchema,
    defaultSettings: AMIRAL_DEFAULT_SETTINGS,
    Editor: AmiralSettingsEditor,
  },
};
