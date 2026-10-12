import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import {
  applyBoardEvent,
  type Ack,
  type BoardEvent,
  type ClientToServerEvents,
  type PresenceUser,
  type ServerToClientEvents,
  type SyncResponse,
} from '@kanban/shared';
import { API_URL, refreshSession } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth';
import { getBoardCache, updateBoardCache } from './board-cache';
import { adoptSnapshot, forgetBoard, recordApplied, sequencerOf } from './realtime-state';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** 공백(seq 누락)을 발견하면 순서가 뒤바뀐 이벤트가 도착할 시간을 잠시 준 뒤 sync를 요청한다. */
const GAP_SYNC_DELAY_MS = 800;

declare global {
  interface Window {
    /** E2E 테스트에서 네트워크 끊김을 재현하기 위한 핸들 */
    __kanban?: { socket: ClientSocket };
  }
}

export function useBoardRealtime(boardId: string, enabled: boolean) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!enabled) return;
    // 캐시에 있는 스냅샷의 seq부터 이어 받는다 (언마운트 동안 놓친 이벤트는 sync로 복구).
    const seq = sequencerOf(boardId, getBoardCache(qc, boardId)?.seq ?? 0);
    let gapTimer: ReturnType<typeof setTimeout> | undefined;
    let syncing = false;

    const socket: ClientSocket = io(API_URL || undefined, {
      path: '/socket.io',
      transports: ['websocket'],
      // 재접속할 때마다 최신 access token을 사용한다.
      auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    window.__kanban = { socket };

    const me = () => useAuthStore.getState().user?.id;

    const sideEffects = (e: BoardEvent) => {
      switch (e.type) {
        case 'board:deleted':
          toast.info('보드가 삭제되었습니다.');
          void qc.invalidateQueries({ queryKey: queryKeys.boards });
          navigateRef.current('/boards', { replace: true });
          break;
        case 'member:removed':
          if (e.payload.userId === me()) {
            toast.info('보드에서 제외되었습니다.');
            void qc.invalidateQueries({ queryKey: queryKeys.boards });
            navigateRef.current('/boards', { replace: true });
          }
          break;
        case 'member:updated':
          // 내 역할이 바뀌면 즉시 UI 권한(드래그/편집 가능 여부)에 반영한다.
          if (e.payload.member.user.id === me()) {
            const role = e.payload.member.role;
            updateBoardCache(qc, boardId, (s) => ({ ...s, role }));
            toast.info(`내 역할이 ${role}(으)로 변경되었습니다.`);
          }
          break;
        case 'comment:added':
          if (e.actorId !== me())
            void qc.invalidateQueries({ queryKey: queryKeys.card(e.payload.comment.cardId) });
          break;
        default:
          break;
      }
    };

    const apply = (events: BoardEvent[]) => {
      if (events.length === 0) return;
      updateBoardCache(qc, boardId, (s) => events.reduce(applyBoardEvent, s));
      recordApplied(boardId, events);
      events.forEach(sideEffects);
    };

    const sync = () => {
      if (syncing || !socket.connected) return;
      syncing = true;
      socket.emit('sync', { boardId, lastSeq: seq.lastSeq }, (res: Ack<SyncResponse>) => {
        syncing = false;
        if (!res.ok) return;
        if (res.data.kind === 'snapshot') {
          const snapshot = res.data.snapshot;
          seq.reset(snapshot.seq);
          qc.setQueryData(queryKeys.board(boardId), adoptSnapshot(boardId, snapshot));
          return;
        }
        const released = res.data.events.flatMap((e) => seq.push(e));
        apply([...released, ...seq.advanceTo(res.data.seq)]);
      });
    };

    socket.on('connect', () => {
      setStatus('connected');
      socket.emit('board:join', { boardId }, (res) => {
        if (!res.ok) {
          if (res.error.status === 403 || res.error.status === 404) {
            toast.error('이 보드에 접근할 수 없습니다.');
            navigateRef.current('/boards', { replace: true });
          }
          return;
        }
        // 스냅샷을 받은 뒤부터 join 사이, 또는 끊겨 있던 동안 놓친 이벤트를 가져온다.
        sync();
      });
    });

    socket.on('board:event', (e) => {
      if (e.boardId !== boardId) return;
      apply(seq.push(e));
      if (seq.hasGap && !gapTimer) {
        gapTimer = setTimeout(() => {
          gapTimer = undefined;
          if (seq.hasGap) sync();
        }, GAP_SYNC_DELAY_MS);
      }
    });

    socket.on('presence:changed', (p) => {
      if (p.boardId === boardId) setPresence(p.users);
    });

    socket.on('disconnect', (reason) => {
      setStatus(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
    });

    socket.on('connect_error', (err) => {
      setStatus('reconnecting');
      // access token 만료: 갱신 후 재접속 (실패하면 로그인 화면으로)
      if (err.message === 'UNAUTHORIZED') {
        void refreshSession().then((ok) => {
          if (ok) socket.connect();
          else navigateRef.current('/login', { replace: true });
        });
      }
    });

    return () => {
      clearTimeout(gapTimer);
      socket.emit('board:leave', { boardId });
      socket.removeAllListeners();
      socket.disconnect();
      if (window.__kanban?.socket === socket) delete window.__kanban;
      forgetBoard(boardId);
    };
  }, [boardId, enabled, qc]);

  return { status, presence };
}
