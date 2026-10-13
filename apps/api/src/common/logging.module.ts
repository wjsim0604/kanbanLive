import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';

/**
 * 구조화 로그 (pino).
 * - 운영: JSON 한 줄 로그 → 로그 수집기(Fly.io logs, Loki 등)에서 필드 단위 검색
 * - 개발: pino-pretty로 사람이 읽기 좋은 형식
 * - 요청마다 reqId를 붙이고(X-Request-Id 전파), 인증 헤더/쿠키는 마스킹한다.
 */
export const AppLoggerModule = LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    base: { instance: process.env.INSTANCE_ID ?? hostname() },
    transport:
      process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json'
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' } },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const existing = req.headers['x-request-id'];
      const id = typeof existing === 'string' && existing ? existing : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    // 헬스체크와 정적 파일은 요청 로그에서 제외
    autoLogging: {
      ignore: (req: IncomingMessage) => !req.url?.startsWith('/api') || req.url === '/api/health',
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  },
});
