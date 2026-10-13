import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { canEdit, type BoardSnapshotDto, type CardDetailDto, type CardDto } from '@kanban/shared';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, toDateInput } from '@/lib/format';
import { queryKeys } from '@/lib/query-client';
import { useUiStore } from '@/stores/ui';
import { updateBoardCache } from './board-cache';
import { useBoardMutations } from './use-board-mutations';

const NONE = '__none__';

/**
 * 카드 상세. 필드 값은 보드 캐시(실시간 반영)에서, 댓글은 카드 상세 쿼리에서 가져온다.
 * 편집 시작 시점의 version을 expectedVersion으로 보내 동시 수정 충돌을 감지한다.
 */
export function CardDetailDialog({ snapshot }: { snapshot: BoardSnapshotDto }) {
  const cardId = useUiStore((s) => s.openCardId);
  const close = useUiStore((s) => s.closeCard);
  const card = snapshot.cards.find((c) => c.id === cardId);

  // 다른 사용자가 카드를 삭제하면 모달을 닫는다.
  useEffect(() => {
    if (cardId && !card) {
      close();
      toast.info('카드가 삭제되었습니다.');
    }
  }, [cardId, card, close]);

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"
        data-testid="card-detail"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {card && <CardDetailBody key={card.id} card={card} snapshot={snapshot} />}
      </DialogContent>
    </Dialog>
  );
}

function CardDetailBody({ card, snapshot }: { card: CardDto; snapshot: BoardSnapshotDto }) {
  const boardId = snapshot.board.id;
  const editable = canEdit(snapshot.role);
  const m = useBoardMutations(boardId);
  const close = useUiStore((s) => s.closeCard);
  const list = snapshot.lists.find((l) => l.id === card.listId);

  // 편집 중일 때만 draft를 갖는다. 편집 중이 아니면 보드 캐시의 최신 값(다른 사용자 변경 포함)을 그대로 보여준다.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState<{ text: string; baseVersion: number } | null>(null);

  const save = (patch: Parameters<typeof api.updateCard>[1], expectedVersion?: number) =>
    m.updateCard.mutateAsync({ cardId: card.id, patch: { ...patch, expectedVersion } });

  const saveTitle = () => {
    const t = titleDraft?.trim();
    setTitleDraft(null);
    if (t && t !== card.title) void save({ title: t }, card.version).catch(() => undefined);
  };

  const saveDescription = async () => {
    if (!descDraft) return;
    // 편집을 시작한 시점의 version으로 낙관적 잠금. 충돌 시 서버 최신값이 표시된다.
    await save({ description: descDraft.text }, descDraft.baseVersion).catch(() => undefined);
    setDescDraft(null);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="sr-only">{card.title}</DialogTitle>
        {editable ? (
          <Input
            value={titleDraft ?? card.title}
            maxLength={200}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="h-auto border-transparent px-1 text-lg font-semibold shadow-none hover:border-input"
            aria-label="카드 제목"
          />
        ) : (
          <p className="text-lg font-semibold">{card.title}</p>
        )}
        <DialogDescription>
          <span className="font-medium text-foreground">{list?.title}</span> 리스트 · v
          {card.version}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>담당자</Label>
          <Select
            disabled={!editable}
            value={card.assigneeId ?? NONE}
            onValueChange={(v) =>
              void save({ assigneeId: v === NONE ? null : v }).catch(() => undefined)
            }
          >
            <SelectTrigger className="w-full" aria-label="담당자">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>없음</SelectItem>
              {snapshot.members.map((mb) => (
                <SelectItem key={mb.user.id} value={mb.user.id}>
                  {mb.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="due">마감일</Label>
          <Input
            id="due"
            type="date"
            disabled={!editable}
            value={toDateInput(card.dueDate)}
            onChange={(e) => void save({ dueDate: e.target.value || null }).catch(() => undefined)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="desc">설명</Label>
        {descDraft ? (
          <>
            <Textarea
              id="desc"
              autoFocus
              rows={5}
              maxLength={10_000}
              value={descDraft.text}
              onChange={(e) => setDescDraft({ ...descDraft, text: e.target.value })}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void saveDescription()}
                disabled={m.updateCard.isPending}
              >
                {m.updateCard.isPending && <Loader2 className="animate-spin" />}
                저장
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDescDraft(null)}>
                취소
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={!editable}
            onClick={() => setDescDraft({ text: card.description, baseVersion: card.version })}
            className="min-h-16 rounded-md border border-dashed p-3 text-left text-sm whitespace-pre-wrap disabled:cursor-default enabled:hover:bg-accent"
            data-testid="card-description"
          >
            {card.description || (
              <span className="text-muted-foreground">
                {editable ? '설명을 추가하세요…' : '설명 없음'}
              </span>
            )}
          </button>
        )}
      </div>

      <Separator />
      <Comments
        cardId={card.id}
        boardId={boardId}
        editable={editable}
        commentCount={card.commentCount}
      />

      {editable && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (!window.confirm('이 카드를 삭제할까요?')) return;
              close();
              m.deleteCard.mutate(card.id);
            }}
          >
            <Trash2 /> 카드 삭제
          </Button>
        </div>
      )}
    </>
  );
}

function Comments({
  cardId,
  boardId,
  editable,
  commentCount,
}: {
  cardId: string;
  boardId: string;
  editable: boolean;
  commentCount: number;
}) {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const { data, isPending, refetch } = useQuery({
    queryKey: queryKeys.card(cardId),
    queryFn: () => api.card(cardId),
  });

  // 다른 사용자가 댓글을 달아 commentCount가 바뀌면 상세를 다시 불러온다.
  useEffect(() => {
    if (data && data.comments.length !== commentCount) void refetch();
  }, [commentCount, data, refetch]);

  const add = useMutation({
    mutationFn: (text: string) => api.addComment(cardId, text),
    onSuccess: (comment) => {
      qc.setQueryData<CardDetailDto>(queryKeys.card(cardId), (d) =>
        d && !d.comments.some((c) => c.id === comment.id)
          ? { ...d, comments: [...d.comments, comment], commentCount: d.comments.length + 1 }
          : d,
      );
      updateBoardCache(qc, boardId, (s) => ({
        ...s,
        cards: s.cards.map((c) =>
          c.id === cardId
            ? { ...c, commentCount: Math.max(c.commentCount, (data?.comments.length ?? 0) + 1) }
            : c,
        ),
      }));
      setContent('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (content.trim()) add.mutate(content.trim());
  };

  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-medium">댓글</h3>
      {isPending && <Skeleton className="h-12" />}
      <ul className="grid gap-3" data-testid="comments">
        {data?.comments.map((c) => (
          <li key={c.id} className="flex gap-2">
            <UserAvatar user={c.author} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author.name}</span> ·{' '}
                {formatDateTime(c.createdAt)}
              </div>
              <p className="text-sm break-words whitespace-pre-wrap">{c.content}</p>
            </div>
          </li>
        ))}
        {data && data.comments.length === 0 && (
          <li className="text-sm text-muted-foreground">아직 댓글이 없습니다.</li>
        )}
      </ul>
      {editable && (
        <form onSubmit={submit} className="flex gap-2">
          <Input
            placeholder="댓글 작성…"
            value={content}
            maxLength={5000}
            onChange={(e) => setContent(e.target.value)}
            aria-label="댓글 입력"
          />
          <Button type="submit" disabled={!content.trim() || add.isPending}>
            등록
          </Button>
        </form>
      )}
    </div>
  );
}
