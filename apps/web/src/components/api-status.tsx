import { useEffect, useState } from 'react';
import { isHealthy, type HealthResponse } from '@kanban/shared';
import { Badge } from '@/components/ui/badge';
import { fetchHealth } from '@/lib/api';

type State =
  { kind: 'loading' } | { kind: 'ok'; data: HealthResponse } | { kind: 'error'; message: string };

export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((data) => setState({ kind: 'ok', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, []);

  if (state.kind === 'loading') {
    return <Badge variant="outline">API 확인 중…</Badge>;
  }
  if (state.kind === 'error') {
    return (
      <Badge variant="destructive" title={state.message}>
        API 연결 실패
      </Badge>
    );
  }
  return isHealthy(state.data) ? (
    <Badge>API 정상 · DB {state.data.db}</Badge>
  ) : (
    <Badge variant="destructive">API 응답 · DB {state.data.db}</Badge>
  );
}
