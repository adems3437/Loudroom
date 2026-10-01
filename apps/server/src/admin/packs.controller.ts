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
import { packInputSchema, type Pack, type PackSummary, type PublicPack } from '@loudroom/shared';
import { parseRequest } from '../http/api-exception.js';
import { AdminGuard, CurrentAdmin, type AdminContext } from './admin.guard.js';
import { PacksService } from './packs.service.js';

@Controller('admin/packs')
@UseGuards(AdminGuard)
export class PacksController {
  constructor(private readonly packs: PacksService) {}

  @Get()
  list(): Promise<PackSummary[]> {
    return this.packs.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Pack> {
    return this.packs.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminContext, @Body() body: unknown): Promise<Pack> {
    return this.packs.create(parseRequest(packInputSchema, body), admin.user.id);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<Pack> {
    return this.packs.update(id, parseRequest(packInputSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.packs.remove(id);
  }
}

/** Public: the packs a host can pick in the lobby (published only, no content). */
@Controller('packs')
export class PublicPacksController {
  constructor(private readonly packs: PacksService) {}

  @Get()
  list(): Promise<PublicPack[]> {
    return this.packs.listPublished();
  }
}
