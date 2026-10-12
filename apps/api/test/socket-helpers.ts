import { io, type Socket } from 'socket.io-client';
import type { AddressInfo, Server } from 'node:net';
import type {
  Ack,
  BoardEvent,
  ClientToServerEvents,
  PresenceChanged,
  ServerToClientEvents,
} from '@kanban/shared';
import type { TestApp } from './helpers';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function listen(app: TestApp): Promise<string> {
  await app.listen(0);
  const server = app.getHttpServer() as unknown as Server;
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

export function connect(url: string, token: string | undefined): Promise<ClientSocket> {
  const socket: ClientSocket = io(url, {
    transports: ['websocket'],
    auth: token ? { token } : {},
    reconnection: false,
    forceNew: true,
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });
}

/** 소켓 이벤트를 쌓아 두고 조건이 맞는 이벤트를 기다린다. */
export class Recorder {
  readonly events: BoardEvent[] = [];
  readonly presence: PresenceChanged[] = [];

  constructor(socket: ClientSocket) {
    socket.on('board:event', (e) => this.events.push(e));
    socket.on('presence:changed', (p) => this.presence.push(p));
  }

  waitFor<T>(pick: () => T | undefined, timeoutMs = 3000): Promise<T> {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const found = pick();
        if (found !== undefined) return resolve(found);
        if (Date.now() - started > timeoutMs)
          return reject(new Error('timeout waiting for socket event'));
        setTimeout(tick, 20);
      };
      tick();
    });
  }

  event<K extends BoardEvent['type']>(
    type: K,
    match: (e: Extract<BoardEvent, { type: K }>) => boolean = () => true,
  ) {
    return this.waitFor(() =>
      this.events.find(
        (e): e is Extract<BoardEvent, { type: K }> =>
          e.type === type && match(e as Extract<BoardEvent, { type: K }>),
      ),
    );
  }
}

export function emitAck<T>(
  socket: ClientSocket,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (socket.emit as (ev: string, p: unknown, cb: (r: Ack<T>) => void) => void)(
      event,
      payload,
      resolve,
    );
  });
}
