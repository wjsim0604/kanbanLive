import { expect, test } from '@playwright/test';
import { addCard, cardTitles, createBoard, dragCard, list, newAccount, signup } from './helpers';

/**
 * 서로 다른 api 인스턴스에 붙은 두 사용자의 동기화 (Redis adapter).
 * MULTI_SERVER_URLS="http://localhost:3001,http://localhost:3002" 처럼 인스턴스별 주소를 주면 실행된다.
 * (docker compose -f docker-compose.yml -f docker-compose.scale.yml --profile scale 구성 참고)
 */
const urls = process.env.MULTI_SERVER_URLS?.split(',') ?? [];

test.skip(urls.length < 2, 'MULTI_SERVER_URLS가 없으면 건너뜀');

test('서로 다른 서버 인스턴스에 붙은 사용자끼리 실시간으로 동기화된다', async ({ browser }) => {
  const [url1, url2] = urls as [string, string];
  const aliceCtx = await browser.newContext({ baseURL: url1 });
  const bobCtx = await browser.newContext({ baseURL: url2 });
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();
  const bobAccount = newAccount('Bob');
  await signup(alice, newAccount('Alice'));
  await signup(bob, bobAccount);

  const boardId = await createBoard(alice, '멀티 서버 보드');
  await alice.getByRole('button', { name: /멤버/ }).click();
  await alice.getByLabel('초대할 이메일').fill(bobAccount.email);
  await alice.getByRole('button', { name: '초대' }).click();
  await alice.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await bob.goto(`/boards/${boardId}`);

  // 응답한 인스턴스가 실제로 다른지 확인
  const instance = async (p: typeof alice) =>
    ((await (await p.request.get('/api/health')).json()) as { instance: string }).instance;
  expect(await instance(alice)).not.toBe(await instance(bob));

  await expect(alice.getByTestId('presence-user')).toHaveCount(2);
  await addCard(alice, '할 일', '서버1에서 생성');
  await expect.poll(() => cardTitles(bob, '할 일')).toEqual(['서버1에서 생성']);

  await dragCard(bob, list(bob, '할 일').getByTestId('card').first(), list(bob, '완료'), 'top');
  await expect.poll(() => cardTitles(alice, '완료')).toEqual(['서버1에서 생성']);
});
