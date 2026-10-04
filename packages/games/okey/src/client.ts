import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyOkeyContent, summarizeOkey, OkeyEditor } from './editor.js';
import { OkeyHost } from './host.js';
import { OkeyPlayer } from './player.js';
import {
  OKEY_DEFAULT_SETTINGS,
  okeyContentSchema,
  okeyHostViewSchema,
  okeyPlayerViewSchema,
  okeySettingsSchema,
  type OkeyContent,
  type OkeyHostView,
  type OkeyPlayerView,
  type OkeySettings,
} from './schema.js';
import { OkeySettingsEditor } from './settings-editor.js';

export { OKEY_GAME_TYPE } from './schema.js';

export const okeyRenderer: GameRenderer<OkeyHostView, OkeyPlayerView, OkeyContent, OkeySettings> = {
  hostViewSchema: okeyHostViewSchema,
  playerViewSchema: okeyPlayerViewSchema,
  Host: OkeyHost,
  Player: OkeyPlayer,
  editor: {
    contentSchema: okeyContentSchema,
    emptyContent: emptyOkeyContent,
    summarize: summarizeOkey,
    Editor: OkeyEditor,
  },
  settings: {
    settingsSchema: okeySettingsSchema,
    defaultSettings: OKEY_DEFAULT_SETTINGS,
    Editor: OkeySettingsEditor,
  },
};
