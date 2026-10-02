import type { GameRenderer } from '@loudroom/game-sdk/client';
import {
  emptyImageLocationContent,
  ImageLocationEditor,
  summarizeImageLocation,
} from './editor.js';
import { ImageLocationHost } from './host.js';
import { ImageLocationPlayer } from './player.js';
import {
  IMAGE_LOCATION_DEFAULT_SETTINGS,
  imageLocationContentSchema,
  imageLocationHostViewSchema,
  imageLocationPlayerViewSchema,
  imageLocationSettingsSchema,
  type ImageLocationContent,
  type ImageLocationHostView,
  type ImageLocationPlayerView,
  type ImageLocationSettings,
} from './schema.js';
import { ImageLocationSettingsEditor } from './settings-editor.js';

export { IMAGE_LOCATION_GAME_TYPE } from './schema.js';

export const imageLocationRenderer: GameRenderer<
  ImageLocationHostView,
  ImageLocationPlayerView,
  ImageLocationContent,
  ImageLocationSettings
> = {
  hostViewSchema: imageLocationHostViewSchema,
  playerViewSchema: imageLocationPlayerViewSchema,
  Host: ImageLocationHost,
  Player: ImageLocationPlayer,
  editor: {
    contentSchema: imageLocationContentSchema,
    emptyContent: emptyImageLocationContent,
    summarize: summarizeImageLocation,
    Editor: ImageLocationEditor,
  },
  settings: {
    settingsSchema: imageLocationSettingsSchema,
    defaultSettings: IMAGE_LOCATION_DEFAULT_SETTINGS,
    Editor: ImageLocationSettingsEditor,
  },
};
