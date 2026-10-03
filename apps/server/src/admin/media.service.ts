import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { mediaFileName, mediaMimeType } from '@loudroom/game-sdk';
import type { MediaItem } from '@loudroom/shared';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiException, notFound } from '../http/api-exception.js';
import { processImage, UnsupportedImageError } from '../media/image-processing.js';
import { MediaStorage } from '../media/media-storage.js';
import {
  looksLikeVideo,
  processVideo,
  UnsupportedVideoError,
  videoToolsAvailable,
  VideoToolsMissingError,
} from '../media/video-processing.js';
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
    durationMs: row.durationMs,
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

interface StoredFile {
  type: 'IMAGE' | 'VIDEO';
  data: Buffer;
  format: 'webp' | 'mp4' | 'webm';
  width: number;
  height: number;
  durationMs: number | null;
}

@Injectable()
export class MediaService implements OnModuleInit {
  /** Whether ffmpeg/ffprobe were found at startup; images never need them. */
  private videoTools = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorage,
  ) {}

  async onModuleInit(): Promise<void> {
    this.videoTools = await videoToolsAvailable(this.tools());
    if (!this.videoTools) {
      logger.warn('ffmpeg/ffprobe not found: video uploads are disabled (images still work)');
    }
  }

  private tools() {
    return { ffmpeg: this.config.media.ffmpegPath, ffprobe: this.config.media.ffprobePath };
  }

  async list(page: number, pageSize: number, type?: 'IMAGE' | 'VIDEO') {
    const where = type ? { type } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.media.count({ where }),
      this.prisma.media.findMany({
        where,
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

  /**
   * Stores an upload after sniffing what it really is (never trusting its name or MIME):
   * images are re-encoded to WebP, videos remuxed without metadata (SPEC §9). Each kind has its
   * own size limit; multer's limit is the larger of the two.
   */
  async upload(file: UploadedFile, altText: string | null, userId: string): Promise<MediaItem> {
    const stored = await this.prepare(file.buffer);
    const id = randomUUID();
    const fileName = mediaFileName(id, stored.format);
    await this.storage.put(fileName, stored.data);
    try {
      const row = await this.prisma.media.create({
        data: {
          id,
          type: stored.type,
          storagePath: fileName,
          mimeType: mediaMimeType(stored.format),
          sizeBytes: stored.data.length,
          width: stored.width,
          height: stored.height,
          durationMs: stored.durationMs,
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

  private async prepare(input: Buffer): Promise<StoredFile> {
    if (looksLikeVideo(input)) {
      if (input.length > this.config.media.maxVideoBytes) {
        throw new ApiException(413, 'MEDIA_TOO_LARGE', 'The video is too large');
      }
      if (!this.videoTools) {
        throw new ApiException(503, 'VIDEO_UNAVAILABLE', 'Video uploads need ffmpeg');
      }
      try {
        const video = await processVideo(input, this.tools(), {
          maxDurationMs: this.config.media.maxVideoMs,
        });
        return { type: 'VIDEO', ...video };
      } catch (error) {
        if (error instanceof UnsupportedVideoError) {
          throw new ApiException(415, 'MEDIA_UNSUPPORTED', error.message);
        }
        if (error instanceof VideoToolsMissingError) {
          throw new ApiException(503, 'VIDEO_UNAVAILABLE', error.message);
        }
        throw error;
      }
    }
    if (input.length > this.config.media.maxUploadBytes) {
      throw new ApiException(413, 'MEDIA_TOO_LARGE', 'The image is too large');
    }
    try {
      const image = await processImage(input);
      return { type: 'IMAGE', format: 'webp', durationMs: null, ...image };
    } catch (error) {
      if (error instanceof UnsupportedImageError) {
        throw new ApiException(415, 'MEDIA_UNSUPPORTED', error.message);
      }
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
