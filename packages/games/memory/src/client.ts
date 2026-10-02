import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyMemoryContent, MemoryEditor, summarizeMemory } from './editor.js';
import { MemoryHost } from './host.js';
import { MemoryPlayer } from './player.js';
import {
  MEMORY_DEFAULT_SETTINGS,
  memoryContentSchema,
  memoryHostViewSchema,
  memoryPlayerViewSchema,
  memorySettingsSchema,
  type MemoryContent,
  type MemoryHostView,
  type MemoryPlayerView,
  type MemorySettings,
} from './schema.js';
import { MemorySettingsEditor } from './settings-editor.js';

export { MEMORY_GAME_TYPE } from './schema.js';

export const memoryRenderer: GameRenderer<
  MemoryHostView,
  MemoryPlayerView,
  MemoryContent,
  MemorySettings
> = {
  hostViewSchema: memoryHostViewSchema,
  playerViewSchema: memoryPlayerViewSchema,
  Host: MemoryHost,
  Player: MemoryPlayer,
  editor: {
    contentSchema: memoryContentSchema,
    emptyContent: emptyMemoryContent,
    summarize: summarizeMemory,
    Editor: MemoryEditor,
  },
  settings: {
    settingsSchema: memorySettingsSchema,
    defaultSettings: MEMORY_DEFAULT_SETTINGS,
    Editor: MemorySettingsEditor,
  },
};
