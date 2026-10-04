import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyPistiContent, summarizePisti, PistiEditor } from './editor.js';
import { PistiHost } from './host.js';
import { PistiPlayer } from './player.js';
import {
  PISTI_DEFAULT_SETTINGS,
  pistiContentSchema,
  pistiHostViewSchema,
  pistiPlayerViewSchema,
  pistiSettingsSchema,
  type PistiContent,
  type PistiHostView,
  type PistiPlayerView,
  type PistiSettings,
} from './schema.js';
import { PistiSettingsEditor } from './settings-editor.js';

export { PISTI_GAME_TYPE } from './schema.js';

export const pistiRenderer: GameRenderer<
  PistiHostView,
  PistiPlayerView,
  PistiContent,
  PistiSettings
> = {
  hostViewSchema: pistiHostViewSchema,
  playerViewSchema: pistiPlayerViewSchema,
  Host: PistiHost,
  Player: PistiPlayer,
  editor: {
    contentSchema: pistiContentSchema,
    emptyContent: emptyPistiContent,
    summarize: summarizePisti,
    Editor: PistiEditor,
  },
  settings: {
    settingsSchema: pistiSettingsSchema,
    defaultSettings: PISTI_DEFAULT_SETTINGS,
    Editor: PistiSettingsEditor,
  },
};
