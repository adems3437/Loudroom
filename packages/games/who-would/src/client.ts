import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyWhoWouldContent, summarizeWhoWould, WhoWouldEditor } from './editor.js';
import { WhoWouldHost } from './host.js';
import { WhoWouldPlayer } from './player.js';
import {
  WHO_WOULD_DEFAULT_SETTINGS,
  whoWouldContentSchema,
  whoWouldHostViewSchema,
  whoWouldPlayerViewSchema,
  whoWouldSettingsSchema,
  type WhoWouldContent,
  type WhoWouldHostView,
  type WhoWouldPlayerView,
  type WhoWouldSettings,
} from './schema.js';
import { WhoWouldSettingsEditor } from './settings-editor.js';

export { WHO_WOULD_GAME_TYPE } from './schema.js';

export const whoWouldRenderer: GameRenderer<
  WhoWouldHostView,
  WhoWouldPlayerView,
  WhoWouldContent,
  WhoWouldSettings
> = {
  hostViewSchema: whoWouldHostViewSchema,
  playerViewSchema: whoWouldPlayerViewSchema,
  Host: WhoWouldHost,
  Player: WhoWouldPlayer,
  editor: {
    contentSchema: whoWouldContentSchema,
    emptyContent: emptyWhoWouldContent,
    summarize: summarizeWhoWould,
    Editor: WhoWouldEditor,
  },
  settings: {
    settingsSchema: whoWouldSettingsSchema,
    defaultSettings: WHO_WOULD_DEFAULT_SETTINGS,
    Editor: WhoWouldSettingsEditor,
  },
};
