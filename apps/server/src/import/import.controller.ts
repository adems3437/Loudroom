import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  importCommitSchema,
  importTemplateQuerySchema,
  type ImportPreview,
} from '@loudroom/shared';
import type { Response } from 'express';
import { AdminGuard, CurrentAdmin, type AdminContext } from '../admin/admin.guard.js';
import { ApiException, parseRequest } from '../http/api-exception.js';
import { ImportService } from './import.service.js';

const MIME = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Content import (SPEC §15 Phase 9): template, preview (saves nothing), save. */
@Controller('admin/import/:gameType')
@UseGuards(AdminGuard)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Get('template')
  async template(
    @Param('gameType') gameType: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { format } = parseRequest(importTemplateQuerySchema, query);
    const file = await this.imports.template(gameType, format);
    response.setHeader('Content-Type', MIME[format]);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="loudroom-${gameType.replace(/[^\w-]/g, '')}.${format}"`,
    );
    return new StreamableFile(file);
  }

  /** multipart/form-data with `file`. */
  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @Param('gameType') gameType: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ImportPreview> {
    if (!file) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'No file', [
        { path: ['file'], code: 'required', message: 'A file is required' },
      ]);
    }
    return this.imports.preview(gameType, file.buffer);
  }

  @Post()
  commit(
    @CurrentAdmin() admin: AdminContext,
    @Param('gameType') gameType: string,
    @Body() body: unknown,
  ) {
    const { items } = parseRequest(importCommitSchema, body);
    return this.imports.commit(gameType, items, admin.user.id);
  }
}
