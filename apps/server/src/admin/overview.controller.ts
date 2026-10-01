import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AdminOverview } from '@loudroom/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminGuard } from './admin.guard.js';

@Controller('admin/overview')
@UseGuards(AdminGuard)
export class OverviewController {
  constructor(private readonly prisma: PrismaService) {}

  /** Counts for the dashboard. */
  @Get()
  async get(): Promise<AdminOverview> {
    const [content, publishedContent, categories, media, packs, publishedPacks, users] =
      await this.prisma.$transaction([
        this.prisma.contentItem.count(),
        this.prisma.contentItem.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.category.count(),
        this.prisma.media.count(),
        this.prisma.gamePack.count(),
        this.prisma.gamePack.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.user.count(),
      ]);
    return {
      content: { total: content, published: publishedContent },
      categories,
      media,
      packs: { total: packs, published: publishedPacks },
      users,
    };
  }
}
