import { Module } from '@nestjs/common';
import { GameTimers } from '../game/game-timers.js';
import { GameEngine } from '../game/game.engine.js';
import { GameGateway } from '../game/game.gateway.js';
import { PackLoader } from '../game/pack-loader.js';
import { SessionRecorder } from '../game/session-recorder.js';
import { PresenceService } from './presence.service.js';
import { RoomBroadcaster } from './room.broadcaster.js';
import { RoomGateway } from './room.gateway.js';
import { RoomService } from './room.service.js';
import { RoomStore } from './room.store.js';

/** Rooms, lobby and the game engine that runs inside a room. */
@Module({
  providers: [
    RoomStore,
    RoomService,
    RoomBroadcaster,
    PresenceService,
    RoomGateway,
    PackLoader,
    SessionRecorder,
    GameTimers,
    GameEngine,
    GameGateway,
  ],
})
export class RoomModule {}
