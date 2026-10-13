import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export interface Account {
  email: string;
  password: string;
  name: string;
}

export const newAccount = (name: string): Account => ({
  email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@e2e.dev`,
  password: 'password123',
  name,
});

export async function signup(page: Page, account: Account): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('이름').fill(account.name);
  await page.getByLabel('이메일').fill(account.email);
  await page.getByLabel('비밀번호').fill(account.password);
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page).toHaveURL(/\/boards$/);
}

export async function login(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(account.email);
  await page.getByLabel('비밀번호').fill(account.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/boards$/);
}

export async function newUserPage(
  browser: Browser,
  name: string,
): Promise<{ page: Page; account: Account }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = newAccount(name);
  await signup(page, account);
  return { page, account };
}

export async function createBoard(page: Page, title: string): Promise<string> {
  await page.getByRole('button', { name: '새 보드' }).click();
  await page.getByLabel('보드 이름').fill(title);
  await page.getByRole('button', { name: '만들기' }).click();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('list')).toHaveCount(3);
  return page.url().split('/').pop() as string;
}

export const list = (page: Page, title: string): Locator =>
  page.getByTestId('list').filter({ has: page.getByRole('heading', { name: title }) });

export const cardTitles = (page: Page, listTitle: string) =>
  list(page, listTitle).getByTestId('card').allInnerTexts();

export async function addCard(page: Page, listTitle: string, title: string): Promise<void> {
  const l = list(page, listTitle);
  const composer = l.getByLabel('새 카드 제목');
  if (!(await composer.isVisible())) await l.getByRole('button', { name: '카드 추가' }).click();
  await composer.fill(title);
  await composer.press('Enter');
  await expect(l.getByTestId('card').filter({ hasText: title })).toBeVisible();
}

/** dnd-kit PointerSensor는 이동 거리 조건이 있어 여러 단계로 마우스를 움직여야 한다. */
export async function dragCard(
  page: Page,
  card: Locator,
  target: Locator,
  position: 'top' | 'bottom' = 'top',
) {
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('element not visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  const y = position === 'top' ? to.y + 5 : to.y + to.height - 5;
  await page.mouse.move(to.x + to.width / 2, y, { steps: 15 });
  await page.waitForTimeout(150);
  await page.mouse.move(to.x + to.width / 2, y + (position === 'top' ? -2 : 2), { steps: 2 });
  await page.mouse.up();
}
