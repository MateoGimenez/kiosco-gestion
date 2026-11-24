import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los errores de la API (4xx) no se arreglan reintentando; los de red sí, una vez.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
});
