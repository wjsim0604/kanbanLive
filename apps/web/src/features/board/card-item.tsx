import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MessageSquare } from 'lucide-react';
import type { BoardMemberDto, CardDto } from '@kanban/shared';
import { UserAvatar } from '@/components/user-avatar';
import { formatDue, isOverdue } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';

interface CardViewProps {
  card: CardDto;
  assignee?: BoardMemberDto;
  className?: string;
}

/** 카드 본문 (드래그 오버레이에서도 재사용) */
export function CardView({ card, assignee, className }: CardViewProps) {
  const hasMeta = card.dueDate || card.commentCount > 0 || assignee;
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 text-sm shadow-xs transition-shadow hover:border-ring/50',
        className,
      )}
    >
      <p className="break-words whitespace-pre-wrap">{card.title}</p>
      {hasMeta && (
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {card.dueDate && (
            <span
              className={cn(
                'flex items-center gap-1 rounded px-1',
                isOverdue(card.dueDate) && 'bg-destructive/10 text-destructive',
              )}
            >
              <Calendar className="size-3" aria-hidden />
              {formatDue(card.dueDate)}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="flex items-center gap-1" aria-label={`댓글 ${card.commentCount}개`}>
              <MessageSquare className="size-3" aria-hidden />
              {card.commentCount}
            </span>
          )}
          {assignee && <UserAvatar user={assignee.user} className="ml-auto size-6" />}
        </div>
      )}
    </div>
  );
}

interface SortableCardProps {
  card: CardDto;
  assignee?: BoardMemberDto;
  disabled: boolean;
}

export const SortableCard = memo(function SortableCard({
  card,
  assignee,
  disabled,
}: SortableCardProps) {
  const openCard = useUiStore((s) => s.openCard);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId: card.listId },
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('list-none', isDragging && 'opacity-40')}
      data-testid="card"
      data-card-id={card.id}
      {...attributes}
      // 드래그가 비활성(뷰어)이어도 카드 상세는 열 수 있어야 하므로 aria-disabled를 덮어쓴다.
      aria-disabled={undefined}
      {...listeners}
      aria-roledescription="카드"
      aria-label={card.title}
      onClick={() => openCard(card.id)}
      onKeyDown={(e) => {
        // Space/Enter는 키보드 드래그에 쓰이므로, 상세 열기는 'o' 또는 드래그 비활성 시 Enter
        if (e.key === 'o' || (disabled && e.key === 'Enter')) openCard(card.id);
        listeners?.onKeyDown?.(e);
      }}
    >
      <CardView card={card} assignee={assignee} className={cn(!disabled && 'cursor-grab')} />
    </li>
  );
});
