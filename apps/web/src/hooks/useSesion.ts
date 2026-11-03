import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UsuarioSesion } from '@afull/shared';
import { useEffect } from 'react';
import { apiFetch, ErrorApi } from '../lib/api.js';
import { fijarUsuarioCola } from '../lib/cola-offline.js';

// Sin señal se usa el último usuario conocido para poder mostrar la app (la API igual valida la cookie al mandar).
const CLAVE_SESION = 'afull_sesion_conocida';
const guardarSesion = (u: UsuarioSesion | null) => {
  try {
    if (u) localStorage.setItem(CLAVE_SESION, JSON.stringify(u));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    /* sin almacenamiento */
  }
};
const sesionConocida = (): UsuarioSesion | null => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null');
  } catch {
    return null;
  }
};

export function useSesion() {
  const queryClient = useQueryClient();

  const {
    data: usuario,
    isLoading: cargando,
    error,
    refetch,
  } = useQuery<UsuarioSesion | null>({
    queryKey: ['sesion', 'yo'],
    queryFn: async () => {
      try {
        const u = await apiFetch<UsuarioSesion>('/api/auth/yo');
        guardarSesion(u);
        return u;
      } catch (err) {
        if (err instanceof ErrorApi && err.status === 401) {
          guardarSesion(null);
          return null;
        }
        if (err instanceof ErrorApi && err.status === 0) {
          const conocida = sesionConocida();
          if (conocida) return conocida;
        }
        throw err;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const mutacionLogin = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      await apiFetch<{ ok: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      // POST /login devuelve solo { id, username } (sin capacidades). La sesión completa
      // se lee de /yo; usar la respuesta del login rompía tieneCapacidad() tras ingresar.
      return apiFetch<UsuarioSesion>('/api/auth/yo');
    },
    onSuccess: (nuevoUsuario) => {
      guardarSesion(nuevoUsuario);
      queryClient.setQueryData(['sesion', 'yo'], nuevoUsuario);
    },
  });

  const mutacionLogout = useMutation({
    mutationFn: async () => {
      try {
        await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
      } catch {
        // Si el endpoint de logout falla (red, 500), no atrapar al usuario:
        // se continúa y se limpia el cliente en onSettled.
      }
    },
    onSettled: () => {
      guardarSesion(null);
      queryClient.setQueryData(['sesion', 'yo'], null);
      queryClient.clear();
    },
  });

  // La cola sin señal solo manda lo de quien está en sesión (en un celular compartido no se mezcla).
  useEffect(() => fijarUsuarioCola(usuario?.username ?? null), [usuario?.username]);

  const tieneCapacidad = (cap: string): boolean => {
    if (!usuario) return false;
    const caps = usuario.capacidades ?? [];
    return caps.includes('admin') || caps.includes(cap);
  };

  return {
    usuario: usuario ?? null,
    cargando,
    autenticado: Boolean(usuario),
    error,
    refetch,
    tieneCapacidad,
    login: mutacionLogin.mutateAsync,
    logout: mutacionLogout.mutateAsync,
    esLoginCargando: mutacionLogin.isPending,
  };
}
