import { Global, Module } from '@nestjs/common';
import { CommandRunner } from './command-runner.service.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Global()
@Module({
  providers: [CommandRunner, RealtimeGateway],
  exports: [CommandRunner],
})
export class RealtimeModule {}
