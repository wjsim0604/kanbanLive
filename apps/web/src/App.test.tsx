import { render, screen } from '@testing-library/react';
import type { AuthResponse, BoardSummaryDto } from '@kanban/shared';
import App from './App';
import { useAuthStore } from './stores/auth';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const session: AuthResponse = {
  accessToken: 'token',
  user: { id: 'u1', email: 'a@test.dev', name: 'Alice' },
};

const board: BoardSummaryDto = {
  id: 'b1',
  title: '포트폴리오',
  role: 'OWNER',
  ownerId: 'u1',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function mockApi(routes: Record<string, () => Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, 'http://localhost').pathname;
    const handler = routes[path];
    return handler ? handler() : json({ message: 'not found' }, 404);
  });
}

describe('App', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', accessToken: null, user: null });
    window.history.pushState({}, '', '/boards');
  });
  afterEach(() => vi.restoreAllMocks());

  it('세션이 없으면 로그인 화면으로 이동한다', async () => {
    mockApi({ '/api/auth/refresh': () => json({ message: 'Missing refresh token' }, 401) });
    render(<App />);
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '데모 계정으로 둘러보기' })).toBeInTheDocument();
  });

  it('refresh 쿠키로 세션을 복구하고 내 보드 목록을 보여준다', async () => {
    const fetchSpy = mockApi({
      '/api/auth/refresh': () => json(session),
      '/api/boards': () => json([board]),
    });
    render(<App />);
    expect(await screen.findByText('포트폴리오')).toBeInTheDocument();
    expect(screen.getByText('소유자')).toBeInTheDocument();
    const boardsCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/api/boards'));
    expect((boardsCall?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer token');
  });
});
