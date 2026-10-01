import { hash, verify } from '@node-rs/argon2';

/** Argon2id with the library's defaults (19 MiB, 2 passes): OWASP's recommended minimum. */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false; // a malformed hash never matches
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real check when the account does not exist, so response times do
 * not reveal which emails have accounts.
 */
export async function verifyNothing(password: string): Promise<false> {
  dummyHash ??= hash('loudroom-timing-equaliser');
  await verifyPassword(await dummyHash, password);
  return false;
}
