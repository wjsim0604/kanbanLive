import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

export const queryKeys = {
  boards: ['boards'] as const,
  board: (id: string) => ['board', id] as const,
  card: (id: string) => ['card', id] as const,
};
