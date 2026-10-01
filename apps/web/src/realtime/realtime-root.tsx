import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { RealtimeProvider } from './realtime-provider';

/**
 * Reads the socket settings at request time rather than baking them into the build, so the
 * same build works on localhost, on a LAN address and behind a reverse proxy.
 */
export async function RealtimeRoot({ children }: { children: ReactNode }) {
  await connection();
  const socketPort = process.env.SOCKET_PORT?.trim() || null;
  return <RealtimeProvider socketPort={socketPort}>{children}</RealtimeProvider>;
}
