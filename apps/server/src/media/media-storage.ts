import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

/**
 * Where media files live (SPEC §13). The MVP keeps them in a directory (a Docker volume) that
 * the server also serves under /media; an S3/MinIO implementation can replace this class
 * without touching its callers.
 */
export abstract class MediaStorage {
  abstract put(fileName: string, data: Buffer): Promise<void>;
  abstract remove(fileName: string): Promise<void>;
}

const SAFE_FILE_NAME = /^[\w-]+\.[a-z0-9]+$/;

function checkedName(fileName: string): string {
  if (!SAFE_FILE_NAME.test(fileName)) throw new Error(`Unsafe media file name: ${fileName}`);
  return fileName;
}

@Injectable()
export class LocalMediaStorage extends MediaStorage implements OnModuleInit {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.config.media.dir, { recursive: true });
  }

  async put(fileName: string, data: Buffer): Promise<void> {
    // `wx`: a file name is never reused, so an existing file means something is wrong.
    await writeFile(join(this.config.media.dir, checkedName(fileName)), data, { flag: 'wx' });
  }

  async remove(fileName: string): Promise<void> {
    await rm(join(this.config.media.dir, checkedName(fileName)), { force: true });
  }
}
