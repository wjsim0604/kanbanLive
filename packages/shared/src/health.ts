export type ServiceStatus = 'up' | 'down';

/** GET /health 응답. api와 web이 같은 타입을 사용한다. */
export interface HealthResponse {
  status: 'ok' | 'error';
  db: ServiceStatus;
  redis: ServiceStatus;
  uptime: number;
  timestamp: string;
}

export const isHealthy = (res: HealthResponse): boolean =>
  res.status === 'ok' && res.db === 'up' && res.redis === 'up';
