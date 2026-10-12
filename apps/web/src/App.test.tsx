import { render, screen } from '@testing-library/react';
import type { HealthResponse } from '@kanban/shared';
import App from './App';

const health = (overrides: Partial<HealthResponse> = {}): HealthResponse => ({
  status: 'ok',
  db: 'up',
  uptime: 1,
  timestamp: new Date(0).toISOString(),
  ...overrides,
});

const mockFetch = (body: HealthResponse, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('제목과 API 정상 상태를 보여준다', async () => {
    mockFetch(health());
    render(<App />);

    expect(screen.getByText('Kanban Live')).toBeInTheDocument();
    expect(await screen.findByText(/API 정상/)).toBeInTheDocument();
  });

  it('DB가 down이면(503) 경고 배지를 보여준다', async () => {
    mockFetch(health({ status: 'error', db: 'down' }), 503);
    render(<App />);

    expect(await screen.findByText(/DB down/)).toBeInTheDocument();
  });

  it('API에 연결할 수 없으면 실패 배지를 보여준다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<App />);

    expect(await screen.findByText('API 연결 실패')).toBeInTheDocument();
  });
});
