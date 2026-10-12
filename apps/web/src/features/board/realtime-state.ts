import {
  applyBoardEvent,
  EventSequencer,
  type BoardEvent,
  type BoardSnapshotDto,
} from '@kanban/shared';

/**
 * 보드별 이벤트 순서 관리.
 * - sequencer: seq 순서대로 이벤트를 내보내고 공백(누락)을 감지한다.
 * - recent: 최근 적용한 이벤트. 스냅샷을 새로 받았을 때 그보다 뒤의 이벤트를 다시 적용해
 *   "스냅샷 요청 중에 도착한 이벤트"가 사라지지 않게 한다 (version 비교로 멱등).
 */
const sequencers = new Map<string, EventSequencer>();
const recent = new Map<string, BoardEvent[]>();
const RECENT_LIMIT = 200;

export function sequencerOf(boardId: string, initialSeq = 0): EventSequencer {
  let s = sequencers.get(boardId);
  if (!s) {
    s = new EventSequencer(initialSeq);
    sequencers.set(boardId, s);
  }
  return s;
}

export function recordApplied(boardId: string, events: BoardEvent[]): void {
  const list = [...(recent.get(boardId) ?? []), ...events];
  recent.set(boardId, list.slice(-RECENT_LIMIT));
}

/** 새 스냅샷을 기준 상태로 삼는다. 이미 처리한 더 최신 이벤트는 다시 적용한다. */
export function adoptSnapshot(boardId: string, snapshot: BoardSnapshotDto): BoardSnapshotDto {
  const seq = sequencerOf(boardId, snapshot.seq);
  let state = snapshot;
  for (const e of recent.get(boardId) ?? [])
    if (e.seq > snapshot.seq) state = applyBoardEvent(state, e);
  seq.reset(Math.max(seq.lastSeq, snapshot.seq));
  return state;
}

export function forgetBoard(boardId: string): void {
  sequencers.delete(boardId);
  recent.delete(boardId);
}
