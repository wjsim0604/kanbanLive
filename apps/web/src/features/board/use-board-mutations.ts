import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  upsertCard,
  upsertList,
  type CardDto,
  type InsertHint,
  type ListDto,
} from '@kanban/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { getBoardCache, updateBoardCache } from './board-cache';
import { moveCardLocally, moveListLocally, restoreCard, restoreList } from './optimistic';

/**
 * 보드 변경 훅. 공통 흐름:
 *   onMutate  → 진행 중인 board 쿼리 취소, 이전 상태 저장, 낙관적 반영
 *   onSuccess → 서버 확정 결과(version 증가)로 덮어쓰기
 *   onError   → 롤백 + 토스트
 */
export function useBoardMutations(boardId: string) {
  const qc = useQueryClient();
  const key = queryKeys.board(boardId);
  const fail = (err: unknown) => toast.error(errorMessage(err));
  const applyCard = (card: CardDto) => updateBoardCache(qc, boardId, (s) => upsertCard(s, card));
  const applyList = (list: ListDto) => updateBoardCache(qc, boardId, (s) => upsertList(s, list));

  const moveCard = useMutation({
    mutationFn: (v: { cardId: string; toListId: string; hint: InsertHint }) =>
      api.moveCard(v.cardId, {
        toListId: v.toListId,
        beforeCardId: v.hint.beforeId ?? null,
        afterCardId: v.hint.afterId ?? null,
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = getBoardCache(qc, boardId)?.cards.find((c) => c.id === v.cardId);
      updateBoardCache(qc, boardId, (s) => moveCardLocally(s, v.cardId, v.toListId, v.hint));
      return { previous };
    },
    onSuccess: applyCard,
    onError: (err, _v, ctx) => {
      if (ctx?.previous) {
        const prev = ctx.previous;
        updateBoardCache(qc, boardId, (s) => restoreCard(s, prev));
      }
      if (err instanceof ApiError && err.status === 404)
        void qc.invalidateQueries({ queryKey: key });
      toast.error(`카드를 옮기지 못했습니다. ${errorMessage(err)}`);
    },
  });

  const moveList = useMutation({
    mutationFn: (v: { listId: string; hint: InsertHint }) =>
      api.moveList(v.listId, {
        beforeListId: v.hint.beforeId ?? null,
        afterListId: v.hint.afterId ?? null,
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = getBoardCache(qc, boardId)?.lists.find((l) => l.id === v.listId);
      updateBoardCache(qc, boardId, (s) => moveListLocally(s, v.listId, v.hint));
      return { previous };
    },
    onSuccess: applyList,
    onError: (err, _v, ctx) => {
      if (ctx?.previous) {
        const prev = ctx.previous;
        updateBoardCache(qc, boardId, (s) => restoreList(s, prev));
      }
      toast.error(`리스트를 옮기지 못했습니다. ${errorMessage(err)}`);
    },
  });

  const createCard = useMutation({
    mutationFn: (v: { listId: string; title: string }) => api.createCard(v.listId, v.title),
    onSuccess: applyCard,
    onError: fail,
  });

  const updateCard = useMutation({
    mutationFn: (v: { cardId: string; patch: Parameters<typeof api.updateCard>[1] }) =>
      api.updateCard(v.cardId, v.patch),
    onSuccess: applyCard,
    onError: (err) => {
      // 동시 수정 충돌: 서버의 최신 카드로 갱신하고 사용자에게 알린다.
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT' && err.body.current) {
        applyCard(err.body.current as CardDto);
      }
      fail(err);
    },
  });

  const deleteCard = useMutation({
    mutationFn: (cardId: string) => api.deleteCard(cardId),
    onMutate: async (cardId) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = getBoardCache(qc, boardId)?.cards.find((c) => c.id === cardId);
      updateBoardCache(qc, boardId, (s) => ({
        ...s,
        cards: s.cards.filter((c) => c.id !== cardId),
      }));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) {
        const prev = ctx.previous;
        updateBoardCache(qc, boardId, (s) => restoreCard(s, prev));
      }
      fail(err);
    },
  });

  const createList = useMutation({
    mutationFn: (title: string) => api.createList(boardId, title),
    onSuccess: applyList,
    onError: fail,
  });

  const renameList = useMutation({
    mutationFn: (v: { listId: string; title: string }) => api.updateList(v.listId, v.title),
    onSuccess: applyList,
    onError: fail,
  });

  const deleteList = useMutation({
    mutationFn: (listId: string) => api.deleteList(listId),
    onSuccess: (_r, listId) =>
      updateBoardCache(qc, boardId, (s) => ({
        ...s,
        lists: s.lists.filter((l) => l.id !== listId),
        cards: s.cards.filter((c) => c.listId !== listId),
      })),
    onError: fail,
  });

  return {
    moveCard,
    moveList,
    createCard,
    updateCard,
    deleteCard,
    createList,
    renameList,
    deleteList,
  };
}
