import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth';

function FullPageLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center" aria-busy="true">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}

export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'unknown') return <FullPageLoading />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function AnonymousOnly() {
  const status = useAuthStore((s) => s.status);
  if (status === 'unknown') return <FullPageLoading />;
  if (status === 'authenticated') return <Navigate to="/boards" replace />;
  return <Outlet />;
}
