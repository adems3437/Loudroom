import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptySortingContent, SortingEditor, summarizeSorting } from './editor.js';
import { SortingHost } from './host.js';
import { SortingPlayer } from './player.js';
import {
  SORTING_DEFAULT_SETTINGS,
  sortingContentSchema,
  sortingHostViewSchema,
  sortingPlayerViewSchema,
  sortingSettingsSchema,
  type SortingContent,
  type SortingHostView,
  type SortingPlayerView,
  type SortingSettings,
} from './schema.js';
import { SortingSettingsEditor } from './settings-editor.js';

export { SORTING_GAME_TYPE } from './schema.js';

export const sortingRenderer: GameRenderer<
  SortingHostView,
  SortingPlayerView,
  SortingContent,
  SortingSettings
> = {
  hostViewSchema: sortingHostViewSchema,
  playerViewSchema: sortingPlayerViewSchema,
  Host: SortingHost,
  Player: SortingPlayer,
  editor: {
    contentSchema: sortingContentSchema,
    emptyContent: emptySortingContent,
    summarize: summarizeSorting,
    Editor: SortingEditor,
  },
  settings: {
    settingsSchema: sortingSettingsSchema,
    defaultSettings: SORTING_DEFAULT_SETTINGS,
    Editor: SortingSettingsEditor,
  },
};
