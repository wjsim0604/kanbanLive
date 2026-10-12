import type { HealthResponse } from '@kanban/shared';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { signal });
  // 503(DB down)도 HealthResponse 본문을 담고 있으므로 그대로 파싱한다.
  if (!res.ok && res.status !== 503) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}
