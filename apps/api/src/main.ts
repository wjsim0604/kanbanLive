import { loadEnvFile } from './common/load-env';
loadEnvFile();
import { initSentry } from './common/sentry';
initSentry();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { serveWeb } from './common/serve-web';
import { setupApp } from './common/setup-app';
import { APP_CONFIG, type AppConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(APP_CONFIG);
  setupApp(app, config);
  if (config.webDistDir) serveWeb(app, config.webDistDir);
  app.enableShutdownHooks();

  await app.listen(config.port);
  app
    .get(Logger)
    .log(`API listening on http://localhost:${config.port} (docs: /docs)`, 'Bootstrap');
}

void bootstrap();
