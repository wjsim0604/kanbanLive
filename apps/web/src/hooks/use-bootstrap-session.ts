import { useEffect } from 'react';
import { refreshSession } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

/** 앱 시작 시 refresh 쿠키로 세션 복구를 시도한다. */
export function useBootstrapSession(): void {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (status === 'unknown') void refreshSession();
  }, [status]);
}
