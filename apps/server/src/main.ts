import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap.js';
import { loadAppConfig } from './config/app-config.js';

const config = loadAppConfig(process.env);
const app = await createApp(config);
await app.listen(config.port, config.host);
Logger.log(`Listening on http://${config.host}:${config.port}`, 'Bootstrap');
