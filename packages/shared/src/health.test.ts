import { describe, expect, it } from 'vitest';
import { isHealthy, type HealthResponse } from './health';

const base: HealthResponse = {
  status: 'ok',
  db: 'up',
  uptime: 1,
  timestamp: new Date(0).toISOString(),
};

describe('isHealthy', () => {
  it('status ok + db up 이면 true', () => {
    expect(isHealthy(base)).toBe(true);
  });

  it('db가 down 이면 false', () => {
    expect(isHealthy({ ...base, status: 'error', db: 'down' })).toBe(false);
  });
});
