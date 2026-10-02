import type { GameRenderer } from '@loudroom/game-sdk/client';
import {
  ClosestNumberEditor,
  emptyClosestNumberContent,
  summarizeClosestNumber,
} from './editor.js';
import { ClosestNumberHost } from './host.js';
import { ClosestNumberPlayer } from './player.js';
import {
  CLOSEST_NUMBER_DEFAULT_SETTINGS,
  closestNumberContentSchema,
  closestNumberHostViewSchema,
  closestNumberPlayerViewSchema,
  closestNumberSettingsSchema,
  type ClosestNumberContent,
  type ClosestNumberHostView,
  type ClosestNumberPlayerView,
  type ClosestNumberSettings,
} from './schema.js';
import { ClosestNumberSettingsEditor } from './settings-editor.js';

export { CLOSEST_NUMBER_GAME_TYPE } from './schema.js';

export const closestNumberRenderer: GameRenderer<
  ClosestNumberHostView,
  ClosestNumberPlayerView,
  ClosestNumberContent,
  ClosestNumberSettings
> = {
  hostViewSchema: closestNumberHostViewSchema,
  playerViewSchema: closestNumberPlayerViewSchema,
  Host: ClosestNumberHost,
  Player: ClosestNumberPlayer,
  editor: {
    contentSchema: closestNumberContentSchema,
    emptyContent: emptyClosestNumberContent,
    summarize: summarizeClosestNumber,
    Editor: ClosestNumberEditor,
  },
  settings: {
    settingsSchema: closestNumberSettingsSchema,
    defaultSettings: CLOSEST_NUMBER_DEFAULT_SETTINGS,
    Editor: ClosestNumberSettingsEditor,
  },
};
