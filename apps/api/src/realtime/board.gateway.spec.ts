import type { AuthService } from '../auth/auth.service';
import type { BoardAccessService } from '../boards/board-access.service';
import type { BoardsService } from '../boards/boards.service';
import type { CardsService } from '../cards/cards.service';
import type { BoardEventsService } from '../events/board-events.service';
import type { ListsService } from '../lists/lists.service';
import { BoardGateway } from './board.gateway';
import type { AppServer } from './socket-types';

describe('BoardGateway presence', () => {
  const emit = jest.fn();
  const fetchSockets = jest.fn();
  const gateway = new BoardGateway(
    {} as AuthService,
    {} as BoardAccessService,
    {} as BoardsService,
    {} as ListsService,
    {} as CardsService,
    {} as BoardEventsService,
  );
  gateway.server = {
    in: () => ({ fetchSockets }),
    to: () => ({ emit }),
  } as unknown as AppServer;

  beforeEach(() => {
    emit.mockReset();
    fetchSockets.mockReset();
  });

  it('같은 사용자의 여러 연결을 하나로 묶어 접속자 목록을 보낸다', async () => {
    const alice = { id: 'a', email: 'a@x', name: 'Alice' };
    const bob = { id: 'b', email: 'b@x', name: 'Bob' };
    fetchSockets.mockResolvedValue([
      { data: { user: alice } },
      { data: { user: alice } },
      { data: { user: bob } },
    ]);

    await gateway.emitPresence('board-1');

    expect(emit).toHaveBeenCalledWith('presence:changed', {
      boardId: 'board-1',
      users: [
        { ...alice, connections: 2 },
        { ...bob, connections: 1 },
      ],
    });
  });

  it('다른 인스턴스 응답 타임아웃으로 fetchSockets가 실패해도 예외를 던지지 않는다 (프로세스 종료 방지)', async () => {
    fetchSockets.mockRejectedValue(
      new Error('timeout reached while waiting for fetchSockets response'),
    );

    await expect(gateway.emitPresence('board-1')).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });
});
