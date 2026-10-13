import { expect, test, type Page } from '@playwright/test';
import { addCard, cardTitles, createBoard, dragCard, list, newUserPage } from './helpers';

async function inviteAndOpen(
  owner: Page,
  guest: Page,
  email: string,
  boardId: string,
  role: '편집자' | '뷰어' = '편집자',
) {
  await owner.getByRole('button', { name: /멤버/ }).click();
  await owner.getByLabel('초대할 이메일').fill(email);
  if (role === '뷰어') {
    await owner.getByRole('combobox', { name: '역할' }).click();
    await owner.getByRole('option', { name: '뷰어' }).click();
  }
  await owner.getByRole('button', { name: '초대' }).click();
  await expect(owner.getByText(/님을 초대했습니다/)).toBeVisible();
  await owner.keyboard.press('Escape');
  await guest.goto(`/boards/${boardId}`);
  await expect(guest.getByTestId('list')).toHaveCount(3);
}

test('네트워크가 끊긴 동안의 변경을 재연결 후 sync로 복구한다', async ({ browser }) => {
  const alice = await newUserPage(browser, 'Alice');
  const bob = await newUserPage(browser, 'Bob');
  const boardId = await createBoard(alice.page, '재연결 보드');
  await inviteAndOpen(alice.page, bob.page, bob.account.email, boardId);
  await addCard(alice.page, '할 일', '끊기기 전 카드');
  await expect.poll(() => cardTitles(bob.page, '할 일')).toEqual(['끊기기 전 카드']);
  await expect(bob.page.getByTestId('connection')).toHaveAttribute('data-status', 'connected');

  // Bob의 네트워크 차단 → 소켓 끊김
  await bob.page.context().setOffline(true);
  await expect(bob.page.getByTestId('connection')).toHaveAttribute('data-status', 'reconnecting', {
    timeout: 20_000,
  });

  // Bob이 오프라인인 동안 Alice가 여러 변경을 한다
  await addCard(alice.page, '할 일', '오프라인 중 생성');
  await dragCard(
    alice.page,
    list(alice.page, '할 일').getByTestId('card').filter({ hasText: '끊기기 전 카드' }),
    list(alice.page, '완료'),
    'top',
  );
  await expect.poll(() => cardTitles(alice.page, '완료')).toEqual(['끊기기 전 카드']);
  await alice.page.getByRole('button', { name: '진행 중 리스트 메뉴' }).click();
  await alice.page.getByRole('menuitem', { name: '이름 변경' }).click();
  await alice.page.getByLabel('리스트 이름').fill('작업 중');
  await alice.page.getByLabel('리스트 이름').press('Enter');

  // Bob 화면은 아직 이전 상태
  expect(await cardTitles(bob.page, '할 일')).toEqual(['끊기기 전 카드']);

  // 네트워크 복구 → 자동 재연결 → sync로 누락 이벤트 반영
  await bob.page.context().setOffline(false);
  await expect(bob.page.getByTestId('connection')).toHaveAttribute('data-status', 'connected', {
    timeout: 20_000,
  });
  await expect.poll(() => cardTitles(bob.page, '할 일')).toEqual(['오프라인 중 생성']);
  await expect.poll(() => cardTitles(bob.page, '완료')).toEqual(['끊기기 전 카드']);
  await expect(list(bob.page, '작업 중')).toBeVisible();

  // 재연결 후에도 실시간 수신이 계속된다
  await addCard(alice.page, '완료', '재연결 후 카드');
  await expect
    .poll(() => cardTitles(bob.page, '완료'))
    .toEqual(['끊기기 전 카드', '재연결 후 카드']);
});

test('뷰어는 읽기 전용이고, 편집자로 바뀌면 즉시 편집할 수 있다', async ({ browser }) => {
  const owner = await newUserPage(browser, 'Owner');
  const viewer = await newUserPage(browser, 'Viewer');
  const boardId = await createBoard(owner.page, '권한 보드');
  await addCard(owner.page, '할 일', '읽기 전용 카드');
  await inviteAndOpen(owner.page, viewer.page, viewer.account.email, boardId, '뷰어');

  const vp = viewer.page;
  await expect(vp.getByText('읽기 전용', { exact: true })).toBeVisible();
  await expect(vp.getByRole('button', { name: '카드 추가' })).toHaveCount(0);
  await expect(vp.getByRole('button', { name: '리스트 추가' })).toHaveCount(0);

  // 드래그를 시도해도 이동되지 않는다
  await dragCard(vp, list(vp, '할 일').getByTestId('card').first(), list(vp, '완료'), 'top');
  expect(await cardTitles(vp, '할 일')).toEqual(['읽기 전용 카드']);

  // 카드 상세도 읽기 전용
  await list(vp, '할 일').getByTestId('card').first().click();
  await expect(vp.getByLabel('카드 제목')).toHaveCount(0);
  await expect(vp.getByLabel('댓글 입력')).toHaveCount(0);
  await vp.keyboard.press('Escape');

  // 소유자가 역할을 편집자로 변경 → 뷰어 화면에 즉시 반영
  await owner.page.getByRole('button', { name: /멤버/ }).click();
  await owner.page.getByRole('combobox', { name: `${viewer.account.name} 역할` }).click();
  await owner.page.getByRole('option', { name: '편집자' }).click();
  await owner.page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(owner.page.getByRole('dialog')).toBeHidden();

  await expect(vp.getByText('읽기 전용', { exact: true })).toHaveCount(0);
  await addCard(vp, '진행 중', '권한 받은 뒤 카드');
  await expect.poll(() => cardTitles(owner.page, '진행 중')).toEqual(['권한 받은 뒤 카드']);
});
