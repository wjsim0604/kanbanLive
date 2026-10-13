import { expect, test } from '@playwright/test';
import { addCard, cardTitles, createBoard, dragCard, list, newUserPage } from './helpers';

test.describe('실시간 동기화 (브라우저 2개)', () => {
  test('한쪽의 카드 생성·이동·수정이 다른 쪽에 즉시 반영되고 접속자가 표시된다', async ({
    browser,
  }) => {
    const alice = await newUserPage(browser, 'Alice');
    const bob = await newUserPage(browser, 'Bob');

    const boardId = await createBoard(alice.page, '실시간 보드');
    await alice.page.getByRole('button', { name: /멤버/ }).click();
    await alice.page.getByLabel('초대할 이메일').fill(bob.account.email);
    await alice.page.getByRole('button', { name: '초대' }).click();
    await expect(alice.page.getByText(`${bob.account.name}님을 초대했습니다.`)).toBeVisible();
    await alice.page.keyboard.press('Escape');

    await bob.page.goto(`/boards/${boardId}`);
    await expect(bob.page.getByTestId('list')).toHaveCount(3);

    // presence: 두 사람 모두 보인다
    await expect(alice.page.getByTestId('presence-user')).toHaveCount(2);
    await expect(bob.page.getByTestId('presence-user')).toHaveCount(2);

    // 생성
    await addCard(alice.page, '할 일', '동기화 카드');
    await addCard(alice.page, '할 일', '두 번째 카드');
    await expect.poll(() => cardTitles(bob.page, '할 일')).toEqual(['동기화 카드', '두 번째 카드']);

    // 이동 (Alice가 드래그 → Bob 화면에 반영)
    await dragCard(
      alice.page,
      list(alice.page, '할 일').getByTestId('card').filter({ hasText: '동기화 카드' }),
      list(alice.page, '완료'),
      'top',
    );
    await expect.poll(() => cardTitles(bob.page, '완료')).toEqual(['동기화 카드']);
    await expect.poll(() => cardTitles(bob.page, '할 일')).toEqual(['두 번째 카드']);

    // 수정 (Bob이 제목 변경 → Alice 화면에 반영)
    await list(bob.page, '완료').getByTestId('card').first().click();
    const title = bob.page.getByLabel('카드 제목');
    await title.fill('제목 바뀜');
    await title.press('Enter');
    await bob.page.keyboard.press('Escape');
    await expect.poll(() => cardTitles(alice.page, '완료')).toEqual(['제목 바뀜']);

    // Bob이 나가면 Alice의 접속자 목록에서 사라진다
    await bob.page.close();
    await expect(alice.page.getByTestId('presence-user')).toHaveCount(1);
  });
});
