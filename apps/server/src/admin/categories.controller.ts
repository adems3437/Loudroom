import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { categoryInputSchema, type Category } from '@loudroom/shared';
import { ApiException, notFound, parseRequest } from '../http/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminGuard } from './admin.guard.js';
import { isUniqueViolation } from './prisma-errors.js';

const withCount = { _count: { select: { contentItems: true } } } as const;

@Controller('admin/categories')
@UseGuards(AdminGuard)
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      include: withCount,
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, createdAt: _c, updatedAt: _u, ...category }) => ({
      ...category,
      contentCount: _count.contentItems,
    }));
  }

  @Post()
  async create(@Body() body: unknown): Promise<Category> {
    const input = parseRequest(categoryInputSchema, body);
    try {
      const row = await this.prisma.category.create({ data: input });
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        contentCount: 0,
      };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiException(409, 'SLUG_TAKEN', 'Slug already used');
      throw error;
    }
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<Category> {
    const input = parseRequest(categoryInputSchema, body);
    if ((await this.prisma.category.count({ where: { id } })) === 0) throw notFound('Category');
    try {
      const row = await this.prisma.category.update({
        where: { id },
        data: input,
        include: withCount,
      });
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        contentCount: row._count.contentItems,
      };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiException(409, 'SLUG_TAKEN', 'Slug already used');
      throw error;
    }
  }

  /** A category with content, or one a pack draws from, stays. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const row = await this.prisma.category.findUnique({ where: { id }, include: withCount });
    if (!row) throw notFound('Category');
    const packRounds = await this.prisma.gamePackRound.count({
      where: { contentSelection: { path: ['categoryId'], equals: id } },
    });
    if (row._count.contentItems > 0 || packRounds > 0) {
      throw new ApiException(409, 'IN_USE', 'The category is in use');
    }
    await this.prisma.category.delete({ where: { id } });
  }
}
