import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createUserRequestSchema, updateUserRequestSchema, type AdminUser } from '@loudroom/shared';
import { ApiException, notFound, parseRequest } from '../http/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSessionStore } from './admin-session.store.js';
import { AdminGuard, AdminOnly, CurrentAdmin, type AdminContext } from './admin.guard.js';
import { toAdminUser } from './admin.views.js';
import { hashPassword } from './password.js';
import { isUniqueViolation } from './prisma-errors.js';

/** User management: ADMIN only (SPEC §9). Nobody can demote or delete themselves. */
@Controller('admin/users')
@UseGuards(AdminGuard)
@AdminOnly()
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AdminSessionStore,
  ) {}

  @Get()
  async list(): Promise<AdminUser[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAdminUser);
  }

  @Post()
  async create(@Body() body: unknown): Promise<AdminUser> {
    const input = parseRequest(createUserRequestSchema, body);
    try {
      const row = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          passwordHash: await hashPassword(input.password),
        },
      });
      return toAdminUser(row);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ApiException(409, 'EMAIL_TAKEN', 'Email already used');
      throw error;
    }
  }

  /** A role change or password reset ends the user's sessions. */
  @Patch(':id')
  async update(
    @CurrentAdmin() admin: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<AdminUser> {
    const input = parseRequest(updateUserRequestSchema, body);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('User');
    const roleChanges = input.role !== undefined && input.role !== target.role;
    if (roleChanges && target.id === admin.user.id) {
      throw new ApiException(400, 'SELF_CHANGE', 'You cannot change your own role');
    }
    if (roleChanges && target.role === 'ADMIN') await this.assertNotLastAdmin();

    const row = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.password !== undefined
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
      },
    });
    if (roleChanges || input.password !== undefined) {
      await this.sessions.destroyAllForUser(id, id === admin.user.id ? admin.token : undefined);
    }
    return toAdminUser(row);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAdmin() admin: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('User');
    if (target.id === admin.user.id) {
      throw new ApiException(400, 'SELF_CHANGE', 'You cannot delete yourself');
    }
    if (target.role === 'ADMIN') await this.assertNotLastAdmin();
    // Their content, media and packs stay; the author link becomes empty.
    await this.prisma.user.delete({ where: { id } });
    await this.sessions.destroyAllForUser(id);
  }

  private async assertNotLastAdmin(): Promise<void> {
    if ((await this.prisma.user.count({ where: { role: 'ADMIN' } })) <= 1) {
      throw new ApiException(409, 'LAST_ADMIN', 'At least one admin must remain');
    }
  }
}
