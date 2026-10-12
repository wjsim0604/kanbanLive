import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye } from 'lucide-react';
import { canEdit } from '@kanban/shared';
import { AppHeader } from '@/components/app-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { useUiStore } from '@/stores/ui';
import { BoardCanvas } from './board-canvas';
import { BoardTitle, MembersDialog, PresenceAvatars } from './board-header';
import { CardDetailDialog } from './card-detail-dialog';
import { ConnectionBadge } from './connection-badge';
import { adoptSnapshot } from './realtime-state';
import { useBoardRealtime } from './use-board-realtime';

export function BoardPage() {
  const { boardId = '' } = useParams();
  const closeCard = useUiStore((s) => s.closeCard);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.board(boardId),
    // 스냅샷을 받는 동안 도착한 이벤트도 반영되도록 실시간 상태와 맞춘다.
    queryFn: async () => adoptSnapshot(boardId, await api.board(boardId)),
  });
  const { status, presence } = useBoardRealtime(boardId, !!data);

  useEffect(() => closeCard, [boardId, closeCard]);

  return (
    <div className="flex h-svh flex-col bg-muted/30">
      <AppHeader>
        <Button variant="ghost" size="icon" asChild aria-label="보드 목록으로">
          <Link to="/boards">
            <ArrowLeft />
          </Link>
        </Button>
        {data && (
          <>
            <BoardTitle key={data.board.title} snapshot={data} />
            {!canEdit(data.role) && (
              <Badge variant="secondary" className="gap-1">
                <Eye /> 읽기 전용
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-3">
              <PresenceAvatars users={presence} />
              <ConnectionBadge status={status} />
              <MembersDialog snapshot={data} />
            </div>
          </>
        )}
      </AppHeader>

      <main className="min-h-0 flex-1">
        {isPending && (
          <div className="flex gap-3 p-4" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-64 w-72" />
            ))}
          </div>
        )}
        {isError && (
          <div className="m-6 max-w-md rounded-lg border bg-background p-6 text-sm">
            <p className="font-medium">
              {error instanceof ApiError && error.status === 404
                ? '보드를 찾을 수 없습니다.'
                : errorMessage(error)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                다시 시도
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/boards">보드 목록</Link>
              </Button>
            </div>
          </div>
        )}
        {data && (
          <>
            <BoardCanvas snapshot={data} />
            <CardDetailDialog snapshot={data} />
          </>
        )}
      </main>
    </div>
  );
}
