import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AnonymousOnly, RequireAuth } from '@/features/auth/auth-guards';
import { AuthPage } from '@/features/auth/auth-page';
import { BoardPage } from '@/features/board/board-page';
import { BoardsPage } from '@/features/boards/boards-page';
import { useBootstrapSession } from '@/hooks/use-bootstrap-session';
import { queryClient } from '@/lib/query-client';

const router = createBrowserRouter([
  {
    element: <AnonymousOnly />,
    children: [
      { path: '/login', element: <AuthPage mode="login" /> },
      { path: '/signup', element: <AuthPage mode="signup" /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/boards', element: <BoardsPage /> },
      { path: '/boards/:boardId', element: <BoardPage /> },
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
