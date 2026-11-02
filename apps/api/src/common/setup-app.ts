import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../config';
import { AppIoAdapter } from '../realtime/io-adapter';
import { AllExceptionsFilter } from './http-exception.filter';

export const API_PREFIX = 'api';

/** main.ts와 e2e 테스트가 같은 설정으로 앱을 구성하도록 한 곳에 모은다. */
export function setupApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useWebSocketAdapter(new AppIoAdapter(app, config));

  const express = app.getHttpAdapter().getInstance() as Express;
  // 프록시 뒤에서 req.ip(요청 제한 키)를 실제 클라이언트 IP로 (config.trustProxy 주석 참고)
  express.set('trust proxy', config.trustProxy);
  app.use(helmet(helmetOptions(config)));
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
  if (config.swaggerEnabled) {
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, swagger));
  }
}

/**
 * 보안 헤더. api가 web(SPA)도 같은 오리진에서 서빙하므로 SPA와 Swagger UI가 동작하는 범위로 CSP를 정한다.
 * - script: 같은 오리진 번들만 (인라인 스크립트 금지)
 * - style: Radix/sonner가 style 속성을 쓰므로 'unsafe-inline' 허용
 * - connect: REST와 Socket.IO(wss) 모두 같은 오리진
 * HSTS는 HTTPS(운영)일 때만 보낸다.
 */
function helmetOptions(config: AppConfig): Parameters<typeof helmet>[0] {
  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'", 'data:'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProduction ? [] : null,
      },
    },
    strictTransportSecurity: config.isProduction
      ? { maxAge: 15_552_000, includeSubDomains: true }
      : false,
    // Socket.IO·Swagger 리소스를 같은 오리진에서 쓰므로 기본값(same-origin)으로 충분하다
    crossOriginEmbedderPolicy: false,
  };
}
