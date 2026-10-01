import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { mediaFileName } from '@loudroom/game-sdk';
import type { MediaItem } from '@loudroom/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiException, notFound } from '../http/api-exception.js';
import { processImage, UnsupportedImageError } from '../media/image-processing.js';
import { MediaStorage } from '../media/media-storage.js';
import { PrismaService } from '../prisma/prisma.service.js';

const logger = new Logger('Media');

const mediaInclude = { _count: { select: { contentItems: true } } } satisfies Prisma.MediaInclude;
type MediaRow = Prisma.MediaGetPayload<{ include: typeof mediaInclude }>;

function toMediaItem(row: MediaRow): MediaItem {
  return {
    id: row.id,
    type: row.type,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    altText: row.altText,
    originalName: row.originalName,
    usageCount: row._count.contentItems,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Multer decodes file names as latin1; browsers send UTF-8. Control characters are dropped. */
function cleanFileName(name: string): string | null {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  const cleaned = decoded
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : null;
}

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorage,
  ) {}

  async list(page: number, pageSize: number) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.media.count(),
      this.prisma.media.findMany({
        include: mediaInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(toMediaItem), total, page, pageSize };
  }

  async get(id: string): Promise<MediaItem> {
    const row = await this.prisma.media.findUnique({ where: { id }, include: mediaInclude });
    if (!row) throw notFound('Media');
    return toMediaItem(row);
  }

  /** Stores an uploaded image re-encoded as WebP; the format is sniffed from the bytes. */
  async upload(file: UploadedFile, altText: string | null, userId: string): Promise<MediaItem> {
    let image;
    try {
      image = await processImage(file.buffer);
    } catch (error) {
      if (error instanceof UnsupportedImageError) {
        throw new ApiException(415, 'MEDIA_UNSUPPORTED', error.message);
      }
      throw error;
    }
    const id = randomUUID();
    const fileName = mediaFileName(id);
    await this.storage.put(fileName, image.data);
    try {
      const row = await this.prisma.media.create({
        data: {
          id,
          type: 'IMAGE',
          storagePath: fileName,
          mimeType: 'image/webp',
          sizeBytes: image.data.length,
          width: image.width,
          height: image.height,
          altText,
          originalName: cleanFileName(file.originalname),
          uploadedById: userId,
        },
        include: mediaInclude,
      });
      return toMediaItem(row);
    } catch (error) {
      await this.storage.remove(fileName);
      throw error;
    }
  }

  async update(id: string, altText: string | null): Promise<MediaItem> {
    await this.get(id);
    const row = await this.prisma.media.update({
      where: { id },
      data: { altText },
      include: mediaInclude,
    });
    return toMediaItem(row);
  }

  /** Media used by content stays (SPEC §15 Phase 4); otherwise the row and file are removed. */
  async remove(id: string): Promise<void> {
    const media = await this.get(id);
    if (media.usageCount > 0) {
      throw new ApiException(409, 'IN_USE', 'Media used by content cannot be deleted');
    }
    const row = await this.prisma.media.delete({ where: { id } });
    await this.storage.remove(row.storagePath).catch((error: unknown) => {
      logger.warn(`could not delete ${row.storagePath}: ${String(error)}`);
    });
  }
}
