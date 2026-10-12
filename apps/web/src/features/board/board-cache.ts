import type { QueryClient } from '@tanstack/react-query';
import type { BoardSnapshotDto } from '@kanban/shared';
import { queryKeys } from '@/lib/query-client';

export type BoardUpdater = (s: BoardSnapshotDto) => BoardSnapshotDto;

export function updateBoardCache(qc: QueryClient, boardId: string, fn: BoardUpdater): void {
  qc.setQueryData<BoardSnapshotDto>(queryKeys.board(boardId), (s) => (s ? fn(s) : s));
}

export function getBoardCache(qc: QueryClient, boardId: string): BoardSnapshotDto | undefined {
  return qc.getQueryData<BoardSnapshotDto>(queryKeys.board(boardId));
}
