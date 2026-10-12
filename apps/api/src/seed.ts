/**
 * 데모 데이터 시드. 배포 URL에서 바로 둘러볼 수 있도록 데모 계정과 샘플 보드를 만든다.
 *
 *   로컬: pnpm --filter @kanban/api build && pnpm --filter @kanban/api seed
 *   운영: node dist/seed.js (Fly.io release_command에서 SEED_DEMO=true일 때 실행)
 *
 * 멱등: 데모 계정이 이미 있으면 아무것도 하지 않는다. SEED_RESET=true면 데모 보드를 지우고 다시 만든다.
 */
import { loadEnvFile } from './common/load-env';
loadEnvFile();

import { PrismaClient } from '@prisma/client';
import { generateNKeysBetween } from '@kanban/shared';
import { hashPassword } from './auth/password';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_USERS = [
  { email: 'demo@kanban.live', name: '데모 사용자' },
  { email: 'jiwoo@kanban.live', name: '김지우' },
  { email: 'minho@kanban.live', name: '이민호' },
] as const;
const DEMO_BOARD_TITLE = 'Kanban Live 런칭 프로젝트';

interface SeedCard {
  title: string;
  description?: string;
  assignee?: number;
  dueInDays?: number;
  comments?: [number, string][];
}

const LISTS: { title: string; cards: SeedCard[] }[] = [
  {
    title: '할 일',
    cards: [
      { title: '랜딩 페이지 카피 작성', assignee: 1, dueInDays: 5 },
      {
        title: '모바일 레이아웃 점검',
        description: '360px 폭에서 리스트 가로 스크롤 확인',
        assignee: 2,
      },
      { title: '온보딩 튜토리얼 기획' },
    ],
  },
  {
    title: '진행 중',
    cards: [
      {
        title: '실시간 동기화 부하 테스트',
        description: '50명 동시 접속, 카드 이동 p95 측정 → docs/performance.md',
        assignee: 0,
        dueInDays: 2,
        comments: [
          [1, '보드 단위 잠금 때문에 핫 보드에서 커넥션 풀이 고갈되는 것 같아요.'],
          [0, '보드별 대기열(동시 2)로 바꾸니 다른 보드 p95가 566ms → 61ms로 줄었습니다!'],
        ],
      },
      { title: 'Sentry 알림 채널 연결', assignee: 2, dueInDays: -1 },
    ],
  },
  {
    title: '리뷰',
    cards: [
      {
        title: '재연결 복구 E2E 테스트',
        description: 'context.setOffline으로 네트워크 끊김 재현',
        assignee: 1,
      },
    ],
  },
  {
    title: '완료',
    cards: [
      { title: '모노레포 세팅 (pnpm, TS strict, CI)', assignee: 0 },
      { title: 'JWT 인증 + refresh token 회전', assignee: 2 },
      { title: '드래그 앤 드롭 (dnd-kit)', assignee: 1 },
    ],
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: DEMO_USERS[0].email } });
    if (existing && process.env.SEED_RESET !== 'true') {
      console.log('demo data already exists — skip (SEED_RESET=true to recreate)');
      return;
    }

    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const users = await Promise.all(
      DEMO_USERS.map((u) =>
        prisma.user.upsert({
          where: { email: u.email },
          update: {},
          create: { ...u, passwordHash },
        }),
      ),
    );
    const [owner] = users;
    if (!owner) throw new Error('unreachable');

    await prisma.board.deleteMany({ where: { ownerId: owner.id, title: DEMO_BOARD_TITLE } });

    const listPositions = generateNKeysBetween(null, null, LISTS.length);
    const board = await prisma.board.create({
      data: {
        title: DEMO_BOARD_TITLE,
        ownerId: owner.id,
        members: {
          create: users.map((u, i) => ({
            userId: u.id,
            role: i === 0 ? 'OWNER' : i === 1 ? 'EDITOR' : 'VIEWER',
          })),
        },
      },
    });

    for (const [li, list] of LISTS.entries()) {
      const created = await prisma.list.create({
        data: { boardId: board.id, title: list.title, position: listPositions[li] as string },
      });
      const cardPositions = generateNKeysBetween(null, null, list.cards.length);
      for (const [ci, card] of list.cards.entries()) {
        await prisma.card.create({
          data: {
            listId: created.id,
            title: card.title,
            description: card.description ?? '',
            position: cardPositions[ci] as string,
            assigneeId: card.assignee !== undefined ? (users[card.assignee]?.id ?? null) : null,
            dueDate:
              card.dueInDays !== undefined
                ? new Date(Date.now() + card.dueInDays * 86_400_000)
                : null,
            comments: {
              create: (card.comments ?? []).map(([author, content]) => ({
                authorId: users[author]?.id ?? owner.id,
                content,
              })),
            },
          },
        });
      }
    }
    console.log(`seeded demo board ${board.id} — login: ${DEMO_USERS[0].email} / ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
