/**
 * 카드 이동 부하 테스트.
 *
 * 각 클라이언트는 Socket.IO로 보드에 접속해 있고, 자기 카드들을 INTERVAL_MS마다 무작위 리스트로 옮긴다
 * (REST POST /cards/:id/move). 측정 항목:
 *   - request:     이동 요청 → HTTP 응답까지 걸린 시간
 *   - propagation: 이동 요청 → 같은 보드의 다른 클라이언트가 card:moved 이벤트를 받기까지 걸린 시간
 *   - error rate:  실패한 요청 비율
 *   - convergence: 종료 후 모든 클라이언트 상태(스냅샷 + 이벤트)가 DB 스냅샷과 같은지
 *
 * 시나리오
 *   - 단일 보드:  CLIENTS=50 BOARDS=1
 *   - 다중 보드:  CLIENTS=50 BOARDS=10            (보드당 5명)
 *   - 핫 보드:    CLIENTS=50 BOARDS=10 HOT_CLIENTS=40 HOT_INTERVAL_MS=100
 *                 → 첫 보드에 40명이 추가로 몰릴 때 나머지(cold) 보드의 지연을 따로 집계한다.
 *
 * 사용: BASE_URL=http://localhost:3000 CLIENTS=20 DURATION_SEC=30 INTERVAL_MS=500 pnpm --filter @kanban/load move-latency
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { io, type Socket } from 'socket.io-client';
import shared, {
  type AuthResponse,
  type BoardEvent,
  type BoardSnapshotDto,
  type CardDto,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@kanban/shared';

const { applyBoardEvent, EventSequencer } = shared;

const env = (key: string, fallback: number) => Number(process.env[key] ?? fallback);
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CLIENTS = env('CLIENTS', 20);
const BOARDS = env('BOARDS', 1);
const HOT_CLIENTS = env('HOT_CLIENTS', 0);
const HOT_INTERVAL_MS = env('HOT_INTERVAL_MS', 100);
const CARDS_PER_CLIENT = env('CARDS_PER_CLIENT', 5);
const DURATION_SEC = env('DURATION_SEC', 30);
const INTERVAL_MS = env('INTERVAL_MS', 500);
const LABEL = process.env.LABEL ?? 'run';
const OUT = process.env.OUT;

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Board {
  id: string;
  owner: AuthResponse;
  listIds: string[];
  initial?: BoardSnapshotDto;
}

interface Client {
  auth: AuthResponse;
  board: Board;
  hot: boolean;
  socket?: ClientSocket;
  events: BoardEvent[];
  cards: string[];
}

interface Sample {
  hot: boolean;
  requestMs: number;
}

async function http<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
};
const avg = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const round = (n: number) => Math.round(n * 10) / 10;
const stats = (values: number[]) => ({
  samples: values.length,
  avg: round(avg(values)),
  p50: round(percentile(values, 50)),
  p95: round(percentile(values, 95)),
  p99: round(percentile(values, 99)),
});

async function main() {
  const run = randomUUID().slice(0, 6);
  const total = CLIENTS + HOT_CLIENTS;
  console.log(
    `▶ ${LABEL}: ${CLIENTS} clients on ${BOARDS} board(s)` +
      (HOT_CLIENTS ? ` + ${HOT_CLIENTS} hot clients on board#0 every ${HOT_INTERVAL_MS}ms` : '') +
      `, ${DURATION_SEC}s, move every ${INTERVAL_MS}ms → ${BASE_URL}`,
  );

  // 1) 사용자 / 보드 / 카드 준비
  const auths: AuthResponse[] = [];
  for (let i = 0; i < total; i += 20) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(20, total - i) }, (_, k) =>
        http<AuthResponse>('POST', '/auth/signup', undefined, {
          email: `load-${run}-${i + k}@load.dev`,
          password: 'password123',
          name: `Load ${i + k}`,
        }),
      ),
    );
    auths.push(...batch);
  }

  const boards: Board[] = [];
  for (let b = 0; b < BOARDS; b++) {
    const owner = auths[b] as AuthResponse;
    const { id } = await http<{ id: string }>('POST', '/boards', owner.accessToken, {
      title: `load ${run} #${b}`,
    });
    const snap = await http<BoardSnapshotDto>('GET', `/boards/${id}`, owner.accessToken);
    boards.push({ id, owner, listIds: snap.lists.map((l) => l.id) });
  }

  const clients: Client[] = auths.map((auth, i) => ({
    auth,
    board: (i < CLIENTS ? boards[i % BOARDS] : boards[0]) as Board,
    hot: i >= CLIENTS,
    events: [],
    cards: [],
  }));

  for (const c of clients) {
    if (c.auth.user.id !== c.board.owner.user.id) {
      await http('POST', `/boards/${c.board.id}/members`, c.board.owner.accessToken, {
        email: c.auth.user.email,
        role: 'EDITOR',
      });
    }
  }

  // 2) 접속
  const arrivals = new Map<string, number[]>(); // `${cardId}:${version}` → 수신 시각들
  for (const c of clients) {
    const socket: ClientSocket = io(BASE_URL, {
      transports: ['websocket'],
      auth: { token: c.auth.accessToken },
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    await new Promise<void>((resolve) =>
      socket.emit('board:join', { boardId: c.board.id }, () => resolve()),
    );
    socket.on('board:event', (e) => {
      c.events.push(e);
      if (e.type === 'card:moved' && e.actorId !== c.auth.user.id) {
        const key = `${e.payload.card.id}:${e.payload.card.version}`;
        const list = arrivals.get(key) ?? [];
        list.push(performance.now());
        arrivals.set(key, list);
      }
    });
    c.socket = socket;
  }

  for (const [i, c] of clients.entries()) {
    for (let k = 0; k < CARDS_PER_CLIENT; k++) {
      const listId = c.board.listIds[(i + k) % c.board.listIds.length];
      const card = await http<CardDto>('POST', `/lists/${listId}/cards`, c.auth.accessToken, {
        title: `c${i}-${k}`,
      });
      c.cards.push(card.id);
    }
  }
  for (const b of boards)
    b.initial = await http<BoardSnapshotDto>('GET', `/boards/${b.id}`, b.owner.accessToken);
  for (const c of clients)
    c.events = c.events.filter((e) => e.seq > (c.board.initial as BoardSnapshotDto).seq);

  // 3) 부하
  const sent = new Map<string, { t0: number; hotBoard: boolean }>();
  const samples: Sample[] = [];
  let ok = 0;
  let failed = 0;
  const endAt = performance.now() + DURATION_SEC * 1000;

  const worker = async (c: Client) => {
    const interval = c.hot ? HOT_INTERVAL_MS : INTERVAL_MS;
    await new Promise((r) => setTimeout(r, Math.random() * interval));
    while (performance.now() < endAt) {
      const cardId = c.cards[Math.floor(Math.random() * c.cards.length)] as string;
      const toListId = c.board.listIds[
        Math.floor(Math.random() * c.board.listIds.length)
      ] as string;
      const t0 = performance.now();
      try {
        const moved = await http<CardDto>('POST', `/cards/${cardId}/move`, c.auth.accessToken, {
          toListId,
          beforeCardId: null,
          afterCardId: null,
        });
        samples.push({
          hot: c.board === boards[0] && HOT_CLIENTS > 0,
          requestMs: performance.now() - t0,
        });
        sent.set(`${moved.id}:${moved.version}`, {
          t0,
          hotBoard: c.board === boards[0] && HOT_CLIENTS > 0,
        });
        ok++;
      } catch (err) {
        failed++;
        if (failed <= 3) console.error(String(err));
      }
      const wait = interval - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  };
  await Promise.all(clients.map(worker));
  await new Promise((r) => setTimeout(r, 1500)); // 마지막 이벤트 전파 대기

  // 4) 집계
  const propagation: { hot: number[]; cold: number[] } = { hot: [], cold: [] };
  for (const [key, { t0, hotBoard }] of sent) {
    for (const t of arrivals.get(key) ?? [])
      (hotBoard ? propagation.hot : propagation.cold).push(t - t0);
  }
  const requestAll = samples.map((s) => s.requestMs);

  const comparable = (s: BoardSnapshotDto) =>
    JSON.stringify(s.cards.map((c) => [c.id, c.listId, c.position, c.version]));
  const finals = new Map<string, string>();
  for (const b of boards)
    finals.set(
      b.id,
      comparable(await http<BoardSnapshotDto>('GET', `/boards/${b.id}`, b.owner.accessToken)),
    );
  let converged = 0;
  for (const c of clients) {
    const initial = c.board.initial as BoardSnapshotDto;
    const seq = new EventSequencer(initial.seq);
    const ordered: BoardEvent[] = [];
    for (const e of c.events) ordered.push(...seq.push(e));
    if (comparable(ordered.reduce(applyBoardEvent, initial)) === finals.get(c.board.id))
      converged++;
  }

  const attempts = ok + failed;
  const result = {
    label: LABEL,
    scenario: {
      clients: CLIENTS,
      boards: BOARDS,
      hotClients: HOT_CLIENTS,
      intervalMs: INTERVAL_MS,
      hotIntervalMs: HOT_INTERVAL_MS,
      durationSec: DURATION_SEC,
    },
    moves: attempts,
    throughputPerSec: round(ok / DURATION_SEC),
    errorRate: attempts ? round((failed / attempts) * 100) : 0,
    request: stats(requestAll),
    propagation: stats([...propagation.hot, ...propagation.cold]),
    ...(HOT_CLIENTS > 0 && {
      hotBoard: {
        request: stats(samples.filter((s) => s.hot).map((s) => s.requestMs)),
        propagation: stats(propagation.hot),
      },
      coldBoards: {
        request: stats(samples.filter((s) => !s.hot).map((s) => s.requestMs)),
        propagation: stats(propagation.cold),
      },
    }),
    converged: `${converged}/${clients.length}`,
  };
  console.log(JSON.stringify(result, null, 2));
  if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2));

  for (const c of clients) c.socket?.close();
  process.exit(converged === clients.length && failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
