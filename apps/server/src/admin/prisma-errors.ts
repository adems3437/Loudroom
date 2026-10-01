import { Prisma } from '../generated/prisma/client.js';

/** A unique constraint was violated (e.g. an email or slug that already exists). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
