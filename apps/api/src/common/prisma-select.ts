import type { Prisma } from '@prisma/client';

export const userSelect = { id: true, email: true, name: true } satisfies Prisma.UserSelect;

export const cardInclude = {
  list: { select: { boardId: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.CardInclude;

export type CardWithMeta = Prisma.CardGetPayload<{ include: typeof cardInclude }>;
