import { QueryClient } from '@tanstack/react-query';
import { ErrorApi } from './api.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 segundos
      retry(failureCount, error) {
        if (error instanceof ErrorApi) {
          // No reintentar errores de autenticación, permisos o conflictos de concurrencia
          if ([400, 401, 403, 404, 409].includes(error.status)) return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
