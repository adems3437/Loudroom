'use client';

import { TIME_SYNC_INTERVAL_MS, type ClockEstimate } from '@loudroom/shared';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { measureClock } from './measure-clock';
import { createSocket } from './socket';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

export interface RealtimeState {
  connection: ConnectionState;
  /** Latest clock estimate; null until the first measurement after connecting. */
  clock: ClockEstimate | null;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

export function RealtimeProvider({
  socketPort,
  children,
}: {
  socketPort: string | null;
  children: ReactNode;
}) {
  const [state, setState] = useState<RealtimeState>({ connection: 'connecting', clock: null });

  useEffect(() => {
    const socket = createSocket(socketPort);
    let active = true;

    const syncClock = async () => {
      const clock = await measureClock(socket);
      if (active && clock) setState((current) => ({ ...current, clock }));
    };

    socket.on('connect', () => {
      setState((current) => ({ ...current, connection: 'connected' }));
      void syncClock();
    });
    socket.on('disconnect', () => {
      setState((current) => ({ ...current, connection: 'reconnecting' }));
    });
    socket.on('connect_error', () => {
      setState((current) =>
        current.connection === 'connecting' ? current : { ...current, connection: 'reconnecting' },
      );
    });

    const resync = setInterval(() => {
      if (socket.connected) void syncClock();
    }, TIME_SYNC_INTERVAL_MS);

    socket.connect();
    return () => {
      active = false;
      clearInterval(resync);
      socket.close();
    };
  }, [socketPort]);

  return <RealtimeContext value={state}>{children}</RealtimeContext>;
}

export function useRealtime(): RealtimeState {
  const state = use(RealtimeContext);
  if (!state) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return state;
}
