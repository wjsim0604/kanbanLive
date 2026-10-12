import type { HealthResponse } from '@kanban/shared';

// 기본은 같은 오리진(/api). 개발 중에는 Vite proxy가 /api, /socket.io를 api 서버로 전달한다.
export const API_URL = import.meta.env.VITE_API_URL ?? '';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`, { signal });
  // 503(DB down)도 HealthResponse 본문을 담고 있으므로 그대로 파싱한다.
  if (!res.ok && res.status !== 503) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}
