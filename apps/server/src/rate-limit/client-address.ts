import { createHmac } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

/** The client's IP; X-Forwarded-For is only honoured behind our own reverse proxy. */
export function clientAddress(
  handshake: { address: string; headers: IncomingHttpHeaders },
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const header = handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return handshake.address;
}

/** Keyed hash of the IP, used instead of the IP itself in rate-limit keys (SPEC §9, KVKK). */
export function hashClientAddress(address: string, secret: string): string {
  return createHmac('sha256', secret).update(address).digest('base64url').slice(0, 22);
}
