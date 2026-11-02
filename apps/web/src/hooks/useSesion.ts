import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UsuarioSesion } from '@afull/shared';
import { apiFetch, ErrorApi } from '../lib/api.js';

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
        return await apiFetch<UsuarioSesion>('/api/auth/yo');
      } catch (err) {
        if (err instanceof ErrorApi && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const mutacionLogin = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiFetch<{ ok: boolean; usuario: UsuarioSesion }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      return res.usuario;
    },
    onSuccess: (nuevoUsuario) => {
      queryClient.setQueryData(['sesion', 'yo'], nuevoUsuario);
    },
  });

  const mutacionLogout = useMutation({
    mutationFn: async () => {
      await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.setQueryData(['sesion', 'yo'], null);
      queryClient.clear();
    },
  });

  const tieneCapacidad = (cap: string): boolean => {
    if (!usuario) return false;
    return usuario.capacidades.includes('admin') || usuario.capacidades.includes(cap);
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
