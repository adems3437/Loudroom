import type { AdminUser } from '@loudroom/shared';
import type { User } from '../generated/prisma/client.js';

/** The only shape of a user sent to clients: never the password hash. */
export function toAdminUser(user: User): AdminUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
