import { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AnonymousOnly, RequireAuth } from '@/features/auth/auth-guards';
import { Skeleton } from '@/components/ui/skeleton';
import { useBootstrapSession } from '@/hooks/use-bootstrap-session';
import { queryClient } from '@/lib/query-client';

// 라우트 단위 코드 분할: 로그인 화면에서는 dnd-kit·socket.io 등 보드 화면 의존성을 받지 않는다.
const AuthPage = lazy(() =>
  import('@/features/auth/auth-page').then((m) => ({ default: m.AuthPage })),
);
const BoardsPage = lazy(() =>
  import('@/features/boards/boards-page').then((m) => ({ default: m.BoardsPage })),
);
const BoardPage = lazy(() =>
  import('@/features/board/board-page').then((m) => ({ default: m.BoardPage })),
);

const page = (element: React.ReactNode) => (
  <Suspense
    fallback={
      <div className="flex min-h-svh items-center justify-center" aria-busy="true">
        <Skeleton className="h-8 w-48" />
      </div>
    }
  >
    {element}
  </Suspense>
);

const router = createBrowserRouter([
  {
    element: <AnonymousOnly />,
    children: [
      { path: '/login', element: page(<AuthPage mode="login" />) },
      { path: '/signup', element: page(<AuthPage mode="signup" />) },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/boards', element: page(<BoardsPage />) },
      { path: '/boards/:boardId', element: page(<BoardPage />) },
    ],
  },
  { path: '*', element: <Navigate to="/boards" replace /> },
]);

export default function App() {
  useBootstrapSession();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
