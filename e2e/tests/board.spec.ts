import { expect, test } from '@playwright/test';
import { addCard, cardTitles, createBoard, dragCard, list, newAccount, signup } from './helpers';

test('카드 생성·드래그 이동 결과가 새로고침 후에도 유지된다', async ({ page }) => {
  await signup(page, newAccount('Solo'));
  await createBoard(page, 'E2E 보드');

  await addCard(page, '할 일', '카드 A');
  await addCard(page, '할 일', '카드 B');
  await addCard(page, '진행 중', '카드 C');

  // 리스트 간 이동: A → 진행 중의 C 위
  await dragCard(
    page,
    list(page, '할 일').getByTestId('card').filter({ hasText: '카드 A' }),
    list(page, '진행 중').getByTestId('card').filter({ hasText: '카드 C' }),
    'top',
  );
  await expect.poll(() => cardTitles(page, '진행 중')).toEqual(['카드 A', '카드 C']);

  // 리스트 내 이동: 진행 중에서 C를 A 위로
  await dragCard(
    page,
    list(page, '진행 중').getByTestId('card').filter({ hasText: '카드 C' }),
    list(page, '진행 중').getByTestId('card').filter({ hasText: '카드 A' }),
    'top',
  );
  await expect.poll(() => cardTitles(page, '진행 중')).toEqual(['카드 C', '카드 A']);

  await page.reload();
  await expect.poll(() => cardTitles(page, '진행 중')).toEqual(['카드 C', '카드 A']);
  await expect.poll(() => cardTitles(page, '할 일')).toEqual(['카드 B']);
});

test('카드 상세에서 설명과 댓글을 저장한다', async ({ page }) => {
  await signup(page, newAccount('Detail'));
  await createBoard(page, '상세 보드');
  await addCard(page, '할 일', '상세 카드');

  await list(page, '할 일').getByTestId('card').filter({ hasText: '상세 카드' }).click();
  const dialog = page.getByTestId('card-detail');
  await dialog.getByTestId('card-description').click();
  await dialog.getByLabel('설명').fill('E2E 설명');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(dialog.getByTestId('card-description')).toHaveText('E2E 설명');

  await dialog.getByLabel('댓글 입력').fill('첫 댓글');
  await dialog.getByRole('button', { name: '등록' }).click();
  await expect(dialog.getByTestId('comments')).toContainText('첫 댓글');

  await page.keyboard.press('Escape');
  await expect(list(page, '할 일').getByLabel('댓글 1개')).toBeVisible();
  await page.reload();
  await expect(list(page, '할 일').getByLabel('댓글 1개')).toBeVisible();
});
