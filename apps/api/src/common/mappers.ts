import type { Comment, List, User } from '@prisma/client';
import type { CardDto, CommentDto, ListDto, UserDto } from '@kanban/shared';
import type { CardWithMeta } from './prisma-select';

export const toUserDto = (u: Pick<User, 'id' | 'email' | 'name'>): UserDto => ({
  id: u.id,
  email: u.email,
  name: u.name,
});

export const toListDto = (l: List): ListDto => ({
  id: l.id,
  boardId: l.boardId,
  title: l.title,
  position: l.position,
  version: l.version,
  createdAt: l.createdAt.toISOString(),
});

export const toCardDto = (c: CardWithMeta): CardDto => ({
  id: c.id,
  boardId: c.list.boardId,
  listId: c.listId,
  title: c.title,
  description: c.description,
  position: c.position,
  assigneeId: c.assigneeId,
  dueDate: c.dueDate ? c.dueDate.toISOString() : null,
  version: c.version,
  commentCount: c._count.comments,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

export const toCommentDto = (
  c: Comment & { author: Pick<User, 'id' | 'email' | 'name'> },
): CommentDto => ({
  id: c.id,
  cardId: c.cardId,
  author: toUserDto(c.author),
  content: c.content,
  createdAt: c.createdAt.toISOString(),
});
