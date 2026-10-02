import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { PhaseClock } from '../module.js';

/** Translates a key under the game's own message namespace (`games.<id>.*` in the web app). */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface RendererPlayer {
  id: string;
  nickname: string;
  avatar: string;
  color: string;
  connected: boolean;
}

/** Draws a player's avatar; provided by the web app, which owns the avatar set. */
export interface AvatarProps {
  avatar: string;
  color: string;
  size: number;
  className?: string;
}

/** What arrives on the round's stream: the whole history (`reset`) or new chunks. */
export interface StreamUpdate {
  reset: boolean;
  chunks: readonly unknown[];
  /** The round's stream limit is reached: the server drops further chunks. */
  full: boolean;
}

/** The round's stream channel (SPEC §5), for games that declare one. */
export interface RoundStream {
  /**
   * Listens for chunks; called at once with everything received so far for this round (as a
   * reset), then with each update. Returns the unsubscribe function.
   */
  subscribe: (listener: (update: StreamUpdate) => void) => () => void;
  /** Sends a chunk (players; fire-and-forget, the server checks it). */
  send: (chunk: unknown) => void;
}

interface RendererBase<View> {
  view: View;
  /** The round's current phase clock from the server. */
  phase: PhaseClock | null;
  /** Current server time (client clock corrected by the measured offset, SPEC §3). */
  serverNow: () => number;
  players: readonly RendererPlayer[];
  t: Translate;
  Avatar: ComponentType<AvatarProps>;
  stream: RoundStream;
}

export type HostRendererProps<View> = RendererBase<View>;

export type SubmitOutcome = { ok: true } | { ok: false; code: string };

export interface PlayerRendererProps<View> extends RendererBase<View> {
  playerId: string;
  /** Sends a round input; resolves with the server's verdict. */
  submit: (input: unknown) => Promise<SubmitOutcome>;
  /** Short tap feedback (vibration where supported). */
  haptic: () => void;
  /** User-facing text for a failed submit's error code. */
  describeError: (code: string) => string;
}

/** Picks an uploaded image (or none). Provided by the admin panel. */
export interface MediaFieldProps {
  value: string | null;
  onChange: (mediaId: string | null) => void;
  label: string;
  testId?: string;
}

/** A problem the server found in the content; `path` is relative to the content. */
export interface ContentIssue {
  path: readonly (string | number)[];
  message: string;
}

export interface ContentEditorProps<Content> {
  /** The draft; may not satisfy the content schema yet. */
  value: Content;
  onChange: (value: Content) => void;
  /** Keys under `games.<id>.editor.*`. */
  t: Translate;
  MediaField: ComponentType<MediaFieldProps>;
  issues: readonly ContentIssue[];
}

/** The admin panel's form for one game's content (SPEC §6: content per game type). */
export interface GameContentEditor<Content> {
  contentSchema: z.ZodType<Content>;
  /** Starting point of a new item. */
  emptyContent: () => Content;
  /** One line describing an item in content lists. */
  summarize: (content: Content) => string;
  Editor: ComponentType<ContentEditorProps<Content>>;
}

export interface SettingsEditorProps<Settings> {
  /** The round's effective settings: the game's defaults with the round's changes on top. */
  value: Settings;
  onChange: (value: Settings) => void;
  /** Keys under `games.<id>.*` (settings texts under `games.<id>.settings.*`). */
  t: Translate;
}

/**
 * The pack editor's form for one round's game settings. The pack stores only the settings
 * that differ from `defaultSettings`; the server validates them with `settingsSchema`.
 */
export interface GameSettingsEditor<Settings> {
  settingsSchema: z.ZodType<Settings>;
  defaultSettings: Settings;
  Editor: ComponentType<SettingsEditorProps<Settings>>;
}

/** What the web registry holds per game type (SPEC §5: gameType → renderer). */
export interface GameRenderer<HostView, PlayerView, Content = unknown, Settings = unknown> {
  hostViewSchema: z.ZodType<HostView>;
  playerViewSchema: z.ZodType<PlayerView>;
  Host: ComponentType<HostRendererProps<HostView>>;
  Player: ComponentType<PlayerRendererProps<PlayerView>>;
  editor: GameContentEditor<Content>;
  settings?: GameSettingsEditor<Settings>;
}
