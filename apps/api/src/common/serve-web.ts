import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { API_PREFIX } from './setup-app';

const PASSTHROUGH = [`/${API_PREFIX}`, '/socket.io', '/docs'];

/**
 * 배포 시 api가 web 빌드 결과물(정적 파일)을 같은 오리진에서 서빙한다.
 * - 쿠키/CORS 설정이 단순해지고 Fly.io 앱 하나로 배포할 수 있다.
 * - SPA 라우팅: API·소켓·문서가 아닌 GET 요청은 index.html로 응답한다.
 */
export function serveWeb(app: NestExpressApplication, dir: string): void {
  const root = resolve(dir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) throw new Error(`WEB_DIST_DIR has no index.html: ${root}`);

  app.useStaticAssets(root, { index: false, maxAge: '1h' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || PASSTHROUGH.some((p) => req.path.startsWith(p))) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
