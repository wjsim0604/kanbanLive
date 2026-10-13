import { useMemo, useState } from 'react';
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { canEdit, cardsOfList, neighborsOf, type BoardSnapshotDto } from '@kanban/shared';
import { CardView, SortableCard } from './card-item';
import { listDndId } from '@/lib/constants';
import { AddListColumn, ListColumn } from './list-column';
import { useBoardMutations } from './use-board-mutations';

type Items = Record<string, string[]>; // listId → 화면상 카드 id 순서

const isListId = (id: string | number) => String(id).startsWith('list:');
const rawListId = (id: string | number) => String(id).slice('list:'.length);

/**
 * 드래그 중에는 로컬 items(리스트별 카드 순서)로 미리보기를 그리고,
 * 드롭 시 최종 위치의 앞/뒤 카드 id만 서버에 보낸다. position은 서버가 확정한다.
 */
export function BoardCanvas({ snapshot }: { snapshot: BoardSnapshotDto }) {
  const boardId = snapshot.board.id;
  const editable = canEdit(snapshot.role);
  const m = useBoardMutations(boardId);

  const baseItems = useMemo<Items>(
    () =>
      Object.fromEntries(
        snapshot.lists.map((l) => [l.id, cardsOfList(snapshot, l.id).map((c) => c.id)]),
      ),
    [snapshot],
  );
  const [dragItems, setDragItems] = useState<Items | null>(null);
  const [active, setActive] = useState<{
    id: string;
    type: 'card' | 'list';
    fromListId?: string;
  } | null>(null);
  const items = dragItems ?? baseItems;

  const cardsById = useMemo(() => new Map(snapshot.cards.map((c) => [c.id, c])), [snapshot.cards]);
  const membersById = useMemo(
    () => new Map(snapshot.members.map((mb) => [mb.user.id, mb])),
    [snapshot.members],
  );
  const listIds = useMemo(() => snapshot.lists.map((l) => listDndId(l.id)), [snapshot.lists]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 리스트를 끌 때는 리스트끼리만, 카드를 끌 때는 카드와 리스트(빈 리스트 드롭용)를 대상으로 충돌을 계산한다.
  const collisionDetection: CollisionDetection = (args) => {
    if (active?.type === 'list') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => isListId(c.id)),
      });
    }
    return closestCorners(args);
  };

  const containerOf = (id: string, its: Items): string | undefined => {
    if (isListId(id)) return rawListId(id);
    return Object.keys(its).find((listId) => its[listId]?.includes(id));
  };

  const onDragStart = ({ active: a }: DragStartEvent) => {
    const id = String(a.id);
    if (isListId(id)) {
      setActive({ id, type: 'list' });
      return;
    }
    setActive({ id, type: 'card', fromListId: containerOf(id, baseItems) });
    setDragItems(structuredClone(baseItems));
  };

  // 다른 리스트 위로 넘어가면 미리보기 items에서 카드를 그 리스트로 옮긴다.
  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over || active?.type !== 'card' || !dragItems) return;
    const activeId = String(a.id);
    const overId = String(over.id);
    const from = containerOf(activeId, dragItems);
    const to = containerOf(overId, dragItems);
    if (!from || !to || from === to) return;

    setDragItems((prev) => {
      if (!prev) return prev;
      const fromItems = (prev[from] ?? []).filter((id) => id !== activeId);
      const toItems = [...(prev[to] ?? [])];
      const overIndex = isListId(overId) ? toItems.length : toItems.indexOf(overId);
      const isBelow =
        over.rect && a.rect.current.translated
          ? a.rect.current.translated.top > over.rect.top + over.rect.height / 2
          : false;
      const index = overIndex < 0 ? toItems.length : overIndex + (isBelow ? 1 : 0);
      toItems.splice(index, 0, activeId);
      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const activeId = String(a.id);
    const current = active;
    setActive(null);

    if (current?.type === 'list') {
      if (over && over.id !== a.id) {
        const oldIndex = listIds.indexOf(activeId);
        const newIndex = listIds.indexOf(String(over.id));
        const ordered = arrayMove(listIds, oldIndex, newIndex).map(rawListId);
        m.moveList.mutate({
          listId: rawListId(activeId),
          hint: neighborsOf(ordered, rawListId(activeId)),
        });
      }
      return;
    }

    const its = dragItems;
    setDragItems(null);
    if (!its || !over) return;
    const to = containerOf(activeId, its);
    if (!to) return;
    let ordered = its[to] ?? [];
    const overId = String(over.id);
    if (!isListId(overId) && ordered.includes(overId)) {
      ordered = arrayMove(ordered, ordered.indexOf(activeId), ordered.indexOf(overId));
    }
    const hint = neighborsOf(ordered, activeId);
    const original = neighborsOf(baseItems[current?.fromListId ?? ''] ?? [], activeId);
    const unchanged =
      to === current?.fromListId &&
      hint.beforeId === original.beforeId &&
      hint.afterId === original.afterId;
    if (!unchanged) m.moveCard.mutate({ cardId: activeId, toListId: to, hint });
  };

  const onDragCancel = () => {
    setActive(null);
    setDragItems(null);
  };

  const activeCard = active?.type === 'card' ? cardsById.get(active.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex h-full items-start gap-3 overflow-x-auto p-4" data-testid="board-canvas">
        <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
          {snapshot.lists.map((list) => {
            const ids = items[list.id] ?? [];
            return (
              <ListColumn
                key={list.id}
                list={list}
                cardIds={ids}
                count={ids.length}
                editable={editable}
                onAddCard={(title) => m.createCard.mutate({ listId: list.id, title })}
                onRename={(title) => m.renameList.mutate({ listId: list.id, title })}
                onDelete={() => m.deleteList.mutate(list.id)}
              >
                {ids.map((id) => {
                  const card = cardsById.get(id);
                  if (!card) return null;
                  return (
                    <SortableCard
                      key={id}
                      card={card}
                      assignee={card.assigneeId ? membersById.get(card.assigneeId) : undefined}
                      disabled={!editable}
                    />
                  );
                })}
              </ListColumn>
            );
          })}
        </SortableContext>
        {editable && <AddListColumn onAdd={(title) => m.createList.mutate(title)} />}
      </div>
      <DragOverlay>
        {activeCard && (
          <CardView
            card={activeCard}
            assignee={activeCard.assigneeId ? membersById.get(activeCard.assigneeId) : undefined}
            className="rotate-2 cursor-grabbing shadow-lg"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
