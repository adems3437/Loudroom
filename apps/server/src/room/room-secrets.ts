import { createHash, randomBytes, randomInt } from 'node:crypto';

/** 6-digit room code without a leading zero (100000–999999), from a CSPRNG. */
export function generateRoomCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

/** 256-bit session token, base64url (43 characters). Only its hash is ever stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
