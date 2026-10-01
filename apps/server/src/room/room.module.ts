import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service.js';
import { RoomBroadcaster } from './room.broadcaster.js';
import { RoomGateway } from './room.gateway.js';
import { RoomService } from './room.service.js';
import { RoomStore } from './room.store.js';

@Module({
  providers: [RoomStore, RoomService, RoomBroadcaster, PresenceService, RoomGateway],
})
export class RoomModule {}
