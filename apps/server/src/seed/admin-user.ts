import { emailSchema, passwordSchema } from '@loudroom/shared';
import { hashPassword } from '../admin/password.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Development admin from ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD. Created once; an existing
 * account is left alone, so a password changed in the panel survives re-seeding.
 */
export async function seedAdminUser(
  prisma: PrismaClient,
  credentials: { email: string; password: string },
): Promise<'created' | 'exists'> {
  const email = emailSchema.parse(credentials.email);
  const password = passwordSchema.parse(credentials.password);
  if (await prisma.user.findUnique({ where: { email } })) return 'exists';
  await prisma.user.create({
    data: {
      email,
      displayName: 'Admin',
      role: 'ADMIN',
      passwordHash: await hashPassword(password),
    },
  });
  return 'created';
}
