import { HttpException, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  boardRoom,
  type Ack,
  type BoardEvent,
  type CardDto,
  type CommentDto,
  type ListDto,
  type PresenceUser,
  type SyncResponse,
} from '@kanban/shared';
import { AuthService } from '../auth/auth.service';
import { BoardAccessService } from '../boards/board-access.service';
import { BoardsService } from '../boards/boards.service';
import { CardsService } from '../cards/cards.service';
import { BoardEventsService } from '../events/board-events.service';
import { ListsService } from '../lists/lists.service';
import {
  JoinBoardDto,
  BoardRefDto,
  SocketAddCommentDto,
  SocketCardRefDto,
  SocketCreateCardDto,
  SocketCreateListDto,
  SocketListRefDto,
  SocketMoveCardDto,
  SocketMoveListDto,
  SocketUpdateCardDto,
  SocketUpdateListDto,
  SyncDto,
} from './dto';
import type { AppServer, AppSocket } from './socket-types';
import { validateDto } from './validate';

export const UNAUTHORIZED = 'UNAUTHORIZED';

/**
 * 실시간 게이트웨이. 컨트롤러처럼 얇게 유지하고, 쓰기는 REST와 같은 서비스 계층을 호출한다.
 * 서비스가 커밋 후 발행한 이벤트(BoardEventsService)를 board:{id} 룸으로 브로드캐스트한다.
 */
@WebSocketGateway()
export class BoardGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(BoardGateway.name);
  private unsubscribe?: () => void;

  @WebSocketServer()
  server!: AppServer;

  constructor(
    private readonly auth: AuthService,
    private readonly access: BoardAccessService,
    private readonly boards: BoardsService,
    private readonly lists: ListsService,
    private readonly cards: CardsService,
    @Inject(BoardEventsService) private readonly events: BoardEventsService,
  ) {}

  afterInit(server: AppServer): void {
    // handshake 단계에서 JWT 검증. 실패 시 클라이언트는 connect_error(UNAUTHORIZED)를 받고 토큰 갱신 후 재접속한다.
    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown }).token;
      try {
        if (typeof token !== 'string') throw new Error('missing token');
        const payload = this.auth.verifyAccessToken(token);
        socket.data.user = { id: payload.sub, email: payload.email, name: payload.name };
        socket.data.boardIds = [];
        next();
      } catch {
        next(new Error(UNAUTHORIZED));
      }
    });
    this.unsubscribe = this.events.subscribe((e) => void this.broadcast(e));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  handleConnection(socket: AppSocket): void {
    this.logger.debug(`connected ${socket.id} (${socket.data.user?.email})`);
  }

  handleDisconnect(socket: AppSocket): void {
    // 연결이 끊긴 뒤 남아 있는 접속자 목록을 다시 계산해 알린다.
    for (const boardId of socket.data.boardIds ?? []) void this.emitPresence(boardId);
  }

  private remember(socket: AppSocket, boardId: string, joined: boolean): void {
    const ids = new Set(socket.data.boardIds ?? []);
    if (joined) ids.add(boardId);
    else ids.delete(boardId);
    socket.data.boardIds = [...ids];
  }

  private async broadcast(event: BoardEvent): Promise<void> {
    const room = boardRoom(event.boardId);
    this.server.to(room).emit('board:event', event);

    // 권한이 사라진 소켓은 룸에서 내보낸다 (이벤트는 먼저 받아 화면을 정리할 수 있게 한다).
    if (event.type === 'board:deleted') {
      this.server.in(room).socketsLeave(room);
    } else if (event.type === 'member:removed') {
      const sockets = await this.server.in(room).fetchSockets();
      for (const s of sockets) if (s.data.user.id === event.payload.userId) s.leave(room);
      void this.emitPresence(event.boardId);
    }
  }

  async emitPresence(boardId: string): Promise<void> {
    const room = boardRoom(boardId);
    const sockets = await this.server.in(room).fetchSockets();
    const users = new Map<string, PresenceUser>();
    for (const s of sockets) {
      const u = s.data.user;
      const existing = users.get(u.id);
      users.set(
        u.id,
        existing
          ? { ...existing, connections: existing.connections + 1 }
          : { ...u, connections: 1 },
      );
    }
    this.server.to(room).emit('presence:changed', { boardId, users: [...users.values()] });
  }

  /* ───────── 구독 ───────── */

  @SubscribeMessage('board:join')
  join(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<{ role: string; seq: number }>> {
    return this.handle(async () => {
      const { boardId } = await validateDto(JoinBoardDto, body);
      const role = await this.access.requireRole(socket.data.user.id, boardId, 'VIEWER');
      await socket.join(boardRoom(boardId));
      this.remember(socket, boardId, true);
      void this.emitPresence(boardId);
      return { role, seq: await this.events.currentSeq(boardId) };
    });
  }

  @SubscribeMessage('board:leave')
  async leave(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): Promise<void> {
    const { boardId } = await validateDto(BoardRefDto, body).catch(() => ({ boardId: null }));
    if (!boardId) return;
    await socket.leave(boardRoom(boardId));
    this.remember(socket, boardId, false);
    void this.emitPresence(boardId);
  }

  @SubscribeMessage('presence:ping')
  async ping(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): Promise<void> {
    const { boardId } = await validateDto(BoardRefDto, body).catch(() => ({ boardId: null }));
    if (boardId && socket.rooms.has(boardRoom(boardId))) void this.emitPresence(boardId);
  }

  /**
   * 재연결 복구: lastSeq 이후 이벤트를 Redis 로그에서 돌려준다.
   * 로그 범위를 벗어났거나 seq가 초기화되었으면 전체 스냅샷을 돌려준다.
   */
  @SubscribeMessage('sync')
  sync(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<SyncResponse>> {
    return this.handle(async (): Promise<SyncResponse> => {
      const { boardId, lastSeq } = await validateDto(SyncDto, body);
      const userId = socket.data.user.id;
      await this.access.requireRole(userId, boardId, 'VIEWER');
      const missed = await this.events.eventsSince(boardId, lastSeq);
      if (missed) return { kind: 'events', events: missed.events, seq: missed.seq };
      return { kind: 'snapshot', snapshot: await this.boards.snapshot(userId, boardId) };
    });
  }

  /* ───────── 쓰기 (REST와 같은 서비스 계층) ───────── */

  @SubscribeMessage('card:move')
  moveCard(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<CardDto>> {
    return this.handle(async () => {
      const dto = await validateDto(SocketMoveCardDto, body);
      return this.cards.move(socket.data.user.id, dto.cardId, dto);
    });
  }

  @SubscribeMessage('card:update')
  updateCard(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<CardDto>> {
    return this.handle(async () => {
      const { boardId: _b, cardId, ...patch } = await validateDto(SocketUpdateCardDto, body);
      return this.cards.update(socket.data.user.id, cardId, patch);
    });
  }

  @SubscribeMessage('card:create')
  createCard(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<CardDto>> {
    return this.handle(async () => {
      const { boardId: _b, listId, ...dto } = await validateDto(SocketCreateCardDto, body);
      return this.cards.create(socket.data.user.id, listId, dto);
    });
  }

  @SubscribeMessage('card:delete')
  deleteCard(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<null>> {
    return this.handle(async () => {
      const dto = await validateDto(SocketCardRefDto, body);
      await this.cards.remove(socket.data.user.id, dto.cardId);
      return null;
    });
  }

  @SubscribeMessage('comment:add')
  addComment(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<CommentDto>> {
    return this.handle(async () => {
      const { cardId, content } = await validateDto(SocketAddCommentDto, body);
      return this.cards.addComment(socket.data.user.id, cardId, { content });
    });
  }

  @SubscribeMessage('list:create')
  createList(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<ListDto>> {
    return this.handle(async () => {
      const { boardId, title } = await validateDto(SocketCreateListDto, body);
      return this.lists.create(socket.data.user.id, boardId, { title });
    });
  }

  @SubscribeMessage('list:update')
  updateList(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<ListDto>> {
    return this.handle(async () => {
      const { listId, title } = await validateDto(SocketUpdateListDto, body);
      return this.lists.update(socket.data.user.id, listId, { title });
    });
  }

  @SubscribeMessage('list:move')
  moveList(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<ListDto>> {
    return this.handle(async () => {
      const { listId, beforeListId, afterListId } = await validateDto(SocketMoveListDto, body);
      return this.lists.move(socket.data.user.id, listId, { beforeListId, afterListId });
    });
  }

  @SubscribeMessage('list:delete')
  deleteList(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<null>> {
    return this.handle(async () => {
      const { listId } = await validateDto(SocketListRefDto, body);
      await this.lists.remove(socket.data.user.id, listId);
      return null;
    });
  }

  /** 서비스 예외를 ack 에러로 변환한다. Nest는 반환값을 ack 콜백 인자로 전달한다. */
  private async handle<T>(fn: () => Promise<T>): Promise<Ack<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      if (err instanceof HttpException) {
        const res = err.getResponse();
        const body =
          typeof res === 'string'
            ? { message: res }
            : (res as { message?: unknown; code?: string });
        const message = Array.isArray(body.message)
          ? body.message.join(', ')
          : String(body.message ?? err.message);
        return { ok: false, error: { status: err.getStatus(), code: body.code, message } };
      }
      this.logger.error(err instanceof Error ? err.stack : String(err));
      return { ok: false, error: { status: 500, message: 'Internal server error' } };
    }
  }
}
