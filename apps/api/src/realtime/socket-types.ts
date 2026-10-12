import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@kanban/shared';
import type { AuthUser } from '../common/current-user.decorator';

export interface SocketData {
  user: AuthUser;
  /** disconnect 시점에는 socket.rooms가 비워지므로, 접속한 보드를 따로 기록한다 */
  boardIds: string[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type InterServerEvents = {};

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
