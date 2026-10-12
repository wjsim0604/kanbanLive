import { useState, type FormEvent, type ReactNode } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ListDto } from '@kanban/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { listDndId } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';

interface ListColumnProps {
  list: ListDto;
  cardIds: string[];
  count: number;
  editable: boolean;
  children: ReactNode;
  onAddCard: (title: string) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

export function ListColumn({
  list,
  cardIds,
  count,
  editable,
  children,
  onAddCard,
  onRename,
  onDelete,
}: ListColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: listDndId(list.id), data: { type: 'list' }, disabled: !editable });
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(list.title);
  const composerOpen = useUiStore((s) => s.composerListId === list.id);
  const setComposer = useUiStore((s) => s.setComposerListId);
  const [draft, setDraft] = useState('');

  const submitRename = (e?: FormEvent) => {
    e?.preventDefault();
    setRenaming(false);
    const t = title.trim();
    if (t && t !== list.title) onRename(t);
    else setTitle(list.title);
  };

  const submitCard = (e: FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    onAddCard(t);
    setDraft('');
  };

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex max-h-full w-72 shrink-0 flex-col rounded-xl border bg-muted/60',
        isDragging && 'opacity-40',
      )}
      data-testid="list"
      data-list-id={list.id}
      aria-label={list.title}
    >
      <header className="flex items-center gap-1 px-2 pt-2 pb-1">
        {editable && (
          <button
            ref={setActivatorNodeRef}
            className="cursor-grab rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label={`${list.title} 리스트 이동`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        {renaming ? (
          <form onSubmit={submitRename} className="flex-1">
            <Input
              autoFocus
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => submitRename()}
              onKeyDown={(e) => e.key === 'Escape' && (setTitle(list.title), setRenaming(false))}
              className="h-8 bg-background"
              aria-label="리스트 이름"
            />
          </form>
        ) : (
          <h2
            className={cn('flex-1 truncate px-1 text-sm font-semibold', editable && 'cursor-text')}
            onDoubleClick={() => editable && (setTitle(list.title), setRenaming(true))}
          >
            {list.title}
            <span className="ml-2 font-normal text-muted-foreground">{count}</span>
          </h2>
        )}
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`${list.title} 리스트 메뉴`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => (setTitle(list.title), setRenaming(true))}>
                <Pencil /> 이름 변경
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  if (window.confirm(`'${list.title}' 리스트와 카드 ${count}개를 삭제할까요?`))
                    onDelete();
                }}
              >
                <Trash2 /> 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <ol
          className="flex min-h-2 flex-col gap-2 overflow-y-auto px-2 py-1"
          data-testid="card-list"
        >
          {children}
        </ol>
      </SortableContext>

      {editable && (
        <div className="p-2">
          {composerOpen ? (
            <form onSubmit={submitCard} className="grid gap-2">
              <Textarea
                autoFocus
                placeholder="카드 제목을 입력하세요"
                value={draft}
                maxLength={200}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                  if (e.key === 'Escape') setComposer(null);
                }}
                className="min-h-14 bg-background"
                aria-label="새 카드 제목"
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!draft.trim()}>
                  추가
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setComposer(null)}>
                  취소
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setComposer(list.id)}
            >
              <Plus /> 카드 추가
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function AddListColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onAdd(t);
    setTitle('');
  };
  return (
    <div className="w-72 shrink-0">
      {open ? (
        <form onSubmit={submit} className="grid gap-2 rounded-xl border bg-muted/60 p-2">
          <Input
            autoFocus
            placeholder="리스트 이름"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            className="bg-background"
            aria-label="새 리스트 이름"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!title.trim()}>
              리스트 추가
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          className="w-full justify-start bg-background/60"
          onClick={() => setOpen(true)}
        >
          <Plus /> 리스트 추가
        </Button>
      )}
    </div>
  );
}
