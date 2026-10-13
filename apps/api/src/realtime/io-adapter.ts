import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import type { AppConfig } from '../config';

/**
 * Socket.IO 서버 구성.
 * - CORS 등 옵션을 앱 설정에서 주입
 * - Redis adapter: 여러 api 인스턴스가 Redis Pub/Sub으로 룸 브로드캐스트와 fetchSockets(presence)를 공유한다.
 *   → 서로 다른 서버에 붙은 사용자끼리도 실시간으로 동기화된다.
 */
export class AppIoAdapter extends IoAdapter {
  private readonly adapterLogger = new Logger(AppIoAdapter.name);
  private readonly clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly config: AppConfig,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.config.webOrigin, credentials: true },
      // 끊김 감지를 빠르게 (기본 25s/20s)
      pingInterval: 10_000,
      pingTimeout: 5_000,
    }) as Server;

    const pub = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    for (const c of [pub, sub])
      c.on('error', (err) => this.adapterLogger.warn(`redis adapter: ${err.message}`));
    this.clients.push(pub, sub);
    server.adapter(createAdapter(pub, sub, { requestsTimeout: 3_000 }));
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
  }
}
