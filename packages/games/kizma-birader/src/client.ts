import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyKizmaContent, summarizeKizma, KizmaEditor } from './editor.js';
import { KizmaHost } from './host.js';
import { KizmaPlayer } from './player.js';
import {
  KIZMA_DEFAULT_SETTINGS,
  kizmaContentSchema,
  kizmaHostViewSchema,
  kizmaPlayerViewSchema,
  kizmaSettingsSchema,
  type KizmaContent,
  type KizmaHostView,
  type KizmaPlayerView,
  type KizmaSettings,
} from './schema.js';
import { KizmaSettingsEditor } from './settings-editor.js';

export { KIZMA_GAME_TYPE } from './schema.js';

export const kizmaRenderer: GameRenderer<
  KizmaHostView,
  KizmaPlayerView,
  KizmaContent,
  KizmaSettings
> = {
  hostViewSchema: kizmaHostViewSchema,
  playerViewSchema: kizmaPlayerViewSchema,
  Host: KizmaHost,
  Player: KizmaPlayer,
  editor: {
    contentSchema: kizmaContentSchema,
    emptyContent: emptyKizmaContent,
    summarize: summarizeKizma,
    Editor: KizmaEditor,
  },
  settings: {
    settingsSchema: kizmaSettingsSchema,
    defaultSettings: KIZMA_DEFAULT_SETTINGS,
    Editor: KizmaSettingsEditor,
  },
};
