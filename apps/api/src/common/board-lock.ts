import type { Prisma } from '@prisma/client';

/**
 * 보드 단위 쓰기 직렬화.
 * 같은 보드에 대한 쓰기 트랜잭션은 Board 행 잠금(SELECT ... FOR UPDATE)을 먼저 잡는다.
 * - 같은 위치에 두 카드가 동시에 들어와도 position이 중복되지 않는다.
 * - 커밋 순서 = seq 발급 순서가 되어 이벤트 순서가 DB 상태와 일치한다.
 * 칸반 보드는 보드당 쓰기 빈도가 낮아 보드 단위 잠금의 비용이 작다 (docs/decisions 참고).
 */
export async function lockBoard(tx: Prisma.TransactionClient, boardId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;
}
