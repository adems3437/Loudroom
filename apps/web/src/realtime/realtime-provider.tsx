'use client';

import {
  ServerEvent,
  TIME_SYNC_INTERVAL_MS,
  gameStateSchema,
  roomStateSchema,
  roundStreamEventSchema,
  sessionErrorEventSchema,
  type ClockEstimate,
  type GameState,
  type RoomState,
  type SessionErrorCode,
} from '@loudroom/shared';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { clientNow, measureClock } from './measure-clock';
import { createSocket, type AppSocket } from './socket';
import { StreamHub } from './stream-hub';

/** `closed`: the server ended this connection on purpose (session opened elsewhere). */
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface RealtimeState {
  socket: AppSocket | null;
  connection: ConnectionState;
  /** Latest clock estimate; null until the first measurement after connecting. */
  clock: ClockEstimate | null;
  /** Latest room snapshot for this connection's session. */
  room: RoomState | null;
  /** Latest game snapshot while a game runs (null in the lobby). */
  game: GameState | null;
  /** Server time now: the local clock corrected by the measured offset (SPEC §3). */
  serverNow: () => number;
  /** Why the server ended the session, if it did. */
  sessionEnded: SessionErrorCode | null;
  /** Binds a session the server already attached to this connection (create/join). */
  adoptSession: (token: string) => void;
  /** Resumes a stored session: reconnects so the server picks the token up from the handshake. */
  resumeSession: (token: string) => void;
  /** Forgets the session and continues anonymously. */
  clearSession: () => void;
  /** Whether this connection currently carries a session token. */
  hasSession: () => boolean;
  /** The current round's `round:stream` chunks (drawing), kept outside React state. */
  streams: StreamHub;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

const RATE_LIMITED_RETRY_MS = 5000;

export function RealtimeProvider({
  socketPort,
  children,
}: {
  socketPort: string | null;
  children: ReactNode;
}) {
  const tokenRef = useRef<string | null>(null);
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [clock, setClock] = useState<ClockEstimate | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const offsetRef = useRef(0);
  const [sessionEnded, setSessionEnded] = useState<SessionErrorCode | null>(null);
  const [streams] = useState(() => new StreamHub());

  useEffect(() => {
    const created = createSocket(socketPort, () => tokenRef.current);
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const syncClock = async () => {
      const estimate = await measureClock(created);
      if (active && estimate) {
        offsetRef.current = estimate.offsetMs;
        setClock(estimate);
      }
    };

    created.on('connect', () => {
      setConnection('connected');
      void syncClock();
    });
    created.on('disconnect', (reason) => {
      // The server only disconnects on purpose (kicked / session replaced): do not fight it.
      setConnection(reason === 'io server disconnect' ? 'closed' : 'reconnecting');
    });
    created.on('connect_error', () => {
      setConnection((current) => (current === 'connecting' ? current : 'reconnecting'));
      // Refused by the server (e.g. rate limited): socket.io will not retry by itself.
      if (!created.active) {
        clearTimeout(retry);
        retry = setTimeout(() => created.connect(), RATE_LIMITED_RETRY_MS);
      }
    });
    created.on(ServerEvent.RoomState, (payload) => {
      const parsed = roomStateSchema.safeParse(payload);
      if (!parsed.success) return;
      const next = parsed.data;
      setRoom((current) =>
        current?.code === next.code && current.version > next.version ? current : next,
      );
      if (next.status === 'LOBBY') setGame(null);
    });
    created.on(ServerEvent.GameState, (payload) => {
      const parsed = gameStateSchema.safeParse(payload);
      if (parsed.success) setGame(parsed.data);
    });
    created.on(ServerEvent.RoundStream, (payload) => {
      const parsed = roundStreamEventSchema.safeParse(payload);
      if (parsed.success) streams.receive(parsed.data);
    });
    created.on(ServerEvent.Error, (payload) => {
      const parsed = sessionErrorEventSchema.safeParse(payload);
      if (!parsed.success) return;
      tokenRef.current = null;
      setRoom(null);
      setGame(null);
      setSessionEnded(parsed.data.code);
      if (parsed.data.code === 'KICKED') {
        // Stay connected anonymously so the page keeps working (e.g. to join again).
        created.once('disconnect', () => created.connect());
      }
    });

    const resync = setInterval(() => {
      if (created.connected) void syncClock();
    }, TIME_SYNC_INTERVAL_MS);

    setSocket(created);
    created.connect();
    return () => {
      active = false;
      clearInterval(resync);
      clearTimeout(retry);
      created.close();
    };
  }, [socketPort, streams]);

  const adoptSession = useCallback((token: string) => {
    tokenRef.current = token;
    setSessionEnded(null);
  }, []);

  const resumeSession = useCallback(
    (token: string) => {
      // Already carried by the current (or upcoming) connection.
      if (tokenRef.current === token && (!socket || socket.active)) return;
      tokenRef.current = token;
      setSessionEnded(null);
      setRoom(null);
      setGame(null);
      if (!socket) return; // the first connect will carry the token
      setConnection('connecting');
      socket.disconnect().connect();
    },
    [socket],
  );

  const clearSession = useCallback(() => {
    const hadSession = tokenRef.current !== null;
    tokenRef.current = null;
    setRoom(null);
    setGame(null);
    setSessionEnded(null);
    if (!socket) return;
    // The server still binds this connection to the old session: start a fresh one.
    if (hadSession) socket.disconnect().connect();
    else if (!socket.active) socket.connect();
  }, [socket]);

  const hasSession = useCallback(() => tokenRef.current !== null, []);
  const serverNow = useCallback(() => clientNow() + offsetRef.current, []);

  const value = useMemo<RealtimeState>(
    () => ({
      socket,
      connection,
      clock,
      room,
      game,
      serverNow,
      sessionEnded,
      adoptSession,
      resumeSession,
      clearSession,
      hasSession,
      streams,
    }),
    [
      socket,
      connection,
      clock,
      room,
      game,
      serverNow,
      sessionEnded,
      adoptSession,
      resumeSession,
      clearSession,
      hasSession,
      streams,
    ],
  );

  return <RealtimeContext value={value}>{children}</RealtimeContext>;
}

export function useRealtime(): RealtimeState {
  const state = use(RealtimeContext);
  if (!state) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return state;
}
