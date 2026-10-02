import type { GameRenderer } from '@loudroom/game-sdk/client';
import { DrawingEditor, emptyDrawingContent, summarizeDrawing } from './editor.js';
import { DrawingHost } from './host.js';
import { DrawingPlayer } from './player.js';
import {
  DRAWING_DEFAULT_SETTINGS,
  drawingContentSchema,
  drawingHostViewSchema,
  drawingPlayerViewSchema,
  drawingSettingsSchema,
  type DrawingContent,
  type DrawingHostView,
  type DrawingPlayerView,
  type DrawingSettings,
} from './schema.js';
import { DrawingSettingsEditor } from './settings-editor.js';

export { DRAWING_GAME_TYPE } from './schema.js';

export const drawingRenderer: GameRenderer<
  DrawingHostView,
  DrawingPlayerView,
  DrawingContent,
  DrawingSettings
> = {
  hostViewSchema: drawingHostViewSchema,
  playerViewSchema: drawingPlayerViewSchema,
  Host: DrawingHost,
  Player: DrawingPlayer,
  editor: {
    contentSchema: drawingContentSchema,
    emptyContent: emptyDrawingContent,
    summarize: summarizeDrawing,
    Editor: DrawingEditor,
  },
  settings: {
    settingsSchema: drawingSettingsSchema,
    defaultSettings: DRAWING_DEFAULT_SETTINGS,
    Editor: DrawingSettingsEditor,
  },
};
