import { expect, test } from '@playwright/test';
import {
  addCard,
  cardTitles,
  createBoard,
  dragCard,
  list,
  newAccount,
  newUserPage,
  signup,
} from './helpers';

test('서버가 이동을 거부하면 카드가 원래 자리로 롤백되고 토스트가 뜬다', async ({ page }) => {
  await signup(page, newAccount('Rollback'));
  await createBoard(page, '롤백 보드');
  await addCard(page, '할 일', '롤백 카드');

  // 서버 실패를 흉내 낸다 (응답 지연 → 낙관적 반영을 눈으로 확인할 시간 확보)
  await page.route('**/api/cards/*/move', async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 500, message: 'boom' }),
    });
  });

  await dragCard(page, list(page, '할 일').getByTestId('card').first(), list(page, '완료'), 'top');
  // 낙관적 업데이트: 응답 전에 이미 옮겨져 있다
  await expect.poll(() => cardTitles(page, '완료')).toEqual(['롤백 카드']);
  // 실패 응답 후 롤백 + 토스트
  await expect(page.getByText(/카드를 옮기지 못했습니다/)).toBeVisible();
  await expect.poll(() => cardTitles(page, '할 일')).toEqual(['롤백 카드']);
  await expect.poll(() => cardTitles(page, '완료')).toEqual([]);
});

test('같은 카드 설명을 동시에 수정하면 늦게 저장한 쪽에 충돌 알림이 뜨고 최신 내용으로 바뀐다', async ({
  browser,
}) => {
  const alice = await newUserPage(browser, 'Alice');
  const bob = await newUserPage(browser, 'Bob');
  const boardId = await createBoard(alice.page, '충돌 보드');
  await alice.page.getByRole('button', { name: /멤버/ }).click();
  await alice.page.getByLabel('초대할 이메일').fill(bob.account.email);
  await alice.page.getByRole('button', { name: '초대' }).click();
  await alice.page.keyboard.press('Escape');
  await addCard(alice.page, '할 일', '공동 편집');
  await bob.page.goto(`/boards/${boardId}`);

  // 두 사람 모두 같은 version에서 설명 편집을 시작
  for (const p of [alice.page, bob.page]) {
    await list(p, '할 일').getByTestId('card').first().click();
    await p.getByTestId('card-description').click();
  }
  await alice.page.getByLabel('설명').fill('Alice의 설명');
  await alice.page.getByRole('button', { name: '저장' }).click();
  await expect(alice.page.getByTestId('card-description')).toHaveText('Alice의 설명');

  await bob.page.getByLabel('설명').fill('Bob의 설명');
  await bob.page.getByRole('button', { name: '저장' }).click();
  await expect(
    bob.page.getByText('다른 사용자가 먼저 수정했습니다', { exact: false }),
  ).toBeVisible();
  await expect(bob.page.getByTestId('card-description')).toHaveText('Alice의 설명');
});
