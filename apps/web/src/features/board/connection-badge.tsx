import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ConnectionStatus } from './use-board-realtime';

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') {
    return (
      <span
        className="hidden items-center text-emerald-600 sm:flex"
        title="실시간 연결됨"
        data-testid="connection"
        data-status={status}
      >
        <Wifi className="size-4" aria-label="실시간 연결됨" />
      </span>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 text-amber-700"
      data-testid="connection"
      data-status={status}
    >
      {status === 'offline' ? <WifiOff /> : <Loader2 className="animate-spin" />}
      {status === 'offline' ? '오프라인' : '재연결 중…'}
    </Badge>
  );
}
