import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSesion } from './useSesion.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function respuesta(status: number, cuerpo: unknown) {
  return {
    ok: status < 400,
    status,
    statusText: '',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => cuerpo,
  };
}

describe('useSesion — login', () => {
  it('después del login la sesión trae las capacidades (no la respuesta parcial de /login)', async () => {
    let logueado = false;
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url === '/api/auth/login') {
        logueado = true;
        // Forma real de la API: sin capacidades
        return respuesta(200, { ok: true, usuario: { id: 'u1', username: 'ana' } });
      }
      if (url === '/api/auth/yo') {
        return logueado
          ? respuesta(200, { id: 'u1', username: 'ana', capacidades: ['comercial'] })
          : respuesta(401, { error: 'No autenticado' });
      }
      return respuesta(404, { error: 'no' });
    }) as unknown as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const envoltorio = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSesion(), { wrapper: envoltorio });
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => {
      await result.current.login({ username: 'ana', password: 'x' });
    });

    await waitFor(() => expect(result.current.usuario?.capacidades).toEqual(['comercial']));
    expect(result.current.tieneCapacidad('comercial')).toBe(true);
    expect(result.current.tieneCapacidad('taller')).toBe(false);
  });
});
