import type { Request } from 'express';
import type { AppConfig } from '../config/app-config.js';
import { clientAddress, hashClientAddress } from '../rate-limit/client-address.js';

/** Hashed client IP of an HTTP request, as used in rate-limit keys (never the plain IP). */
export function requestAddressKey(request: Request, config: AppConfig): string {
  const address = clientAddress(
    { address: request.socket.remoteAddress ?? 'unknown', headers: request.headers },
    config.trustProxy,
  );
  return hashClientAddress(address, config.ipHashSecret);
}
