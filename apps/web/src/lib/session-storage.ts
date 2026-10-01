import { useMemo, useSyncExternalStore } from 'react';

/**
 * Session tokens per room in localStorage (SPEC §4: survives reloads; socket ids are not
 * trusted). Storage can be unavailable (private mode, blocked site data), so every access is
 * guarded and the app keeps working without persistence.
 */
export interface StoredSession {
  token: string;
  /** Players only. */
  playerId?: string;
}

type Role = 'host' | 'player';

const key = (role: Role, roomCode: string) => `loudroom:${role}:${roomCode}`;
/** Same-tab change notification (the `storage` event only fires in other tabs). */
const CHANGE_EVENT = 'loudroom:session-change';

function readRaw(role: Role, roomCode: string): string | null {
  try {
    return window.localStorage.getItem(key(role, roomCode));
  } catch {
    return null;
  }
}

function parse(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'token' in parsed &&
      typeof parsed.token === 'string'
    ) {
      const playerId =
        'playerId' in parsed && typeof parsed.playerId === 'string' ? parsed.playerId : undefined;
      return playerId ? { token: parsed.token, playerId } : { token: parsed.token };
    }
    return null;
  } catch {
    return null;
  }
}

export function loadSession(role: Role, roomCode: string): StoredSession | null {
  return parse(readRaw(role, roomCode));
}

export function saveSession(role: Role, roomCode: string, session: StoredSession): void {
  try {
    window.localStorage.setItem(key(role, roomCode), JSON.stringify(session));
  } catch {
    // Not persisted: a reload will then need a fresh join.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function removeSession(role: Role, roomCode: string): void {
  try {
    window.localStorage.removeItem(key(role, roomCode));
  } catch {
    // nothing stored
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * The stored session for a room, kept in sync with storage. `undefined` during server
 * rendering and hydration, when storage cannot be read yet.
 */
export function useStoredSession(role: Role, roomCode: string): StoredSession | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(role, roomCode),
    () => undefined,
  );
  return useMemo(() => (raw === undefined ? undefined : parse(raw)), [raw]);
}
