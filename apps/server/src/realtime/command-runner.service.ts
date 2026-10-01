import { Inject, Injectable } from '@nestjs/common';
import {
  ackError,
  clientCommands,
  type Ack,
  type ClientCommand,
  type CommandInput,
  type CommandResult,
} from '@loudroom/shared';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { RateLimiterService } from '../rate-limit/rate-limiter.service.js';
import { runCommand } from './run-command.js';
import type { AppSocket } from './socket-types.js';

/** Entry point for every client command: per-connection rate limit, validation, ack. */
@Injectable()
export class CommandRunner {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async run<C extends ClientCommand>(
    socket: AppSocket,
    command: C,
    payload: unknown,
    handler: (input: CommandInput<C>) => CommandResult<C> | Promise<CommandResult<C>>,
  ): Promise<Ack<CommandResult<C>>> {
    const allowed = await this.rateLimiter.consume(
      'cmd',
      socket.id,
      this.config.rateLimits.command,
    );
    if (!allowed) return ackError('RATE_LIMITED', 'Too many requests');
    const schema = clientCommands[command].request;
    return runCommand(schema, payload, (input) => handler(input as CommandInput<C>));
  }
}
