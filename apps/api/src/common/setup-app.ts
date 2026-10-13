import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { AppConfig } from '../config';
import { AppIoAdapter } from '../realtime/io-adapter';
import { AllExceptionsFilter } from './http-exception.filter';

export const API_PREFIX = 'api';

/** main.ts와 e2e 테스트가 같은 설정으로 앱을 구성하도록 한 곳에 모은다. */
export function setupApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useWebSocketAdapter(new AppIoAdapter(app, config));
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swagger = new DocumentBuilder()
    .setTitle('Kanban Live API')
    .setDescription(
      '실시간 협업 칸반보드 REST API. 실시간 이벤트는 Socket.IO(`/socket.io`)로 전달된다.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('kl_refresh')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, swagger));
}
