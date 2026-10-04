import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyUnoContent, summarizeUno, UnoEditor } from './editor.js';
import { UnoHost } from './host.js';
import { UnoPlayer } from './player.js';
import {
  UNO_DEFAULT_SETTINGS,
  unoContentSchema,
  unoHostViewSchema,
  unoPlayerViewSchema,
  unoSettingsSchema,
  type UnoContent,
  type UnoHostView,
  type UnoPlayerView,
  type UnoSettings,
} from './schema.js';
import { UnoSettingsEditor } from './settings-editor.js';

export { UNO_GAME_TYPE } from './schema.js';

export const unoRenderer: GameRenderer<UnoHostView, UnoPlayerView, UnoContent, UnoSettings> = {
  hostViewSchema: unoHostViewSchema,
  playerViewSchema: unoPlayerViewSchema,
  Host: UnoHost,
  Player: UnoPlayer,
  editor: {
    contentSchema: unoContentSchema,
    emptyContent: emptyUnoContent,
    summarize: summarizeUno,
    Editor: UnoEditor,
  },
  settings: {
    settingsSchema: unoSettingsSchema,
    defaultSettings: UNO_DEFAULT_SETTINGS,
    Editor: UnoSettingsEditor,
  },
};
