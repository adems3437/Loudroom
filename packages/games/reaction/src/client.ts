import type { GameRenderer } from '@loudroom/game-sdk/client';
import { emptyReactionContent, ReactionEditor, summarizeReaction } from './editor.js';
import { ReactionHost } from './host.js';
import { ReactionPlayer } from './player.js';
import {
  REACTION_DEFAULT_SETTINGS,
  reactionContentSchema,
  reactionHostViewSchema,
  reactionPlayerViewSchema,
  reactionSettingsSchema,
  type ReactionContent,
  type ReactionHostView,
  type ReactionPlayerView,
  type ReactionSettings,
} from './schema.js';
import { ReactionSettingsEditor } from './settings-editor.js';

export { REACTION_GAME_TYPE } from './schema.js';

export const reactionRenderer: GameRenderer<
  ReactionHostView,
  ReactionPlayerView,
  ReactionContent,
  ReactionSettings
> = {
  hostViewSchema: reactionHostViewSchema,
  playerViewSchema: reactionPlayerViewSchema,
  Host: ReactionHost,
  Player: ReactionPlayer,
  editor: {
    contentSchema: reactionContentSchema,
    emptyContent: emptyReactionContent,
    summarize: summarizeReaction,
    Editor: ReactionEditor,
  },
  settings: {
    settingsSchema: reactionSettingsSchema,
    defaultSettings: REACTION_DEFAULT_SETTINGS,
    Editor: ReactionSettingsEditor,
  },
};
