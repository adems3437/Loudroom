import { z } from 'zod';

/** Admin panel roles (SPEC §9). Only ADMIN manages users. */
export const userRoleSchema = z.enum(['ADMIN', 'EDITOR']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Emails are compared lower-cased and trimmed. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const displayNameSchema = z.string().trim().min(1).max(60);

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  // Not checked against the policy: an old password must still be able to log in.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const adminUserSchema = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: userRoleSchema,
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** Answer of login and `GET /api/admin/auth/me`: who is logged in and the CSRF token. */
export const adminSessionSchema = z.strictObject({
  user: adminUserSchema,
  csrfToken: z.string(),
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const changePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const createUserRequestSchema = z.strictObject({
  email: emailSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
  password: passwordSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/** Every field is optional; a password here resets the user's password. */
export const updateUserRequestSchema = z.strictObject({
  displayName: displayNameSchema.optional(),
  role: userRoleSchema.optional(),
  password: passwordSchema.optional(),
});
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
