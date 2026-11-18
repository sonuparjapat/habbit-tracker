import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err: any) => count < 2 && err?.status !== 401 && err?.status !== 404,
    },
  },
});
