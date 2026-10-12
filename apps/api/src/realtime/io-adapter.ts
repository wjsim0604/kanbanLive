import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import type { AppConfig } from '../config';

/** Socket.IO 서버 옵션(CORS 등)을 앱 설정에서 주입한다. Phase 6에서 Redis adapter도 여기서 연결한다. */
export class AppIoAdapter extends IoAdapter {
  protected readonly adapterLogger = new Logger(AppIoAdapter.name);

  constructor(
    app: INestApplicationContext,
    protected readonly config: AppConfig,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.config.webOrigin, credentials: true },
      // 끊김 감지를 빠르게 (기본 25s/20s)
      pingInterval: 10_000,
      pingTimeout: 5_000,
    });
  }
}
