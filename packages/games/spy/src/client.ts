import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptySpyContent, summarizeSpy, SpyEditor } from './editor.js';
import { SpyHost } from './host.js';
import { SpyPlayer } from './player.js';
import {
  SPY_DEFAULT_SETTINGS,
  spyContentSchema,
  spyHostViewSchema,
  spyPlayerViewSchema,
  spySettingsSchema,
  type SpyContent,
  type SpyHostView,
  type SpyPlayerView,
  type SpySettings,
} from './schema.js';
import { SpySettingsEditor } from './settings-editor.js';

export { SPY_GAME_TYPE } from './schema.js';

export const spyRenderer: GameRenderer<SpyHostView, SpyPlayerView, SpyContent, SpySettings> = {
  hostViewSchema: spyHostViewSchema,
  playerViewSchema: spyPlayerViewSchema,
  Host: SpyHost,
  Player: SpyPlayer,
  editor: {
    contentSchema: spyContentSchema,
    emptyContent: emptySpyContent,
    summarize: summarizeSpy,
    Editor: SpyEditor,
  },
  settings: {
    settingsSchema: spySettingsSchema,
    defaultSettings: SPY_DEFAULT_SETTINGS,
    Editor: SpySettingsEditor,
  },
};
