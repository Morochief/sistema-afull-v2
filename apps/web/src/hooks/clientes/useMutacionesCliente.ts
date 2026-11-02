import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  crearCliente,
  editarCliente,
  cambiarEstadoCliente,
  type NuevoCliente,
  type PatchCliente,
} from '../../lib/api-clientes.js';
import type { ErrorApi } from '../../lib/api.js';
import type { ClienteFila } from '@afull/shared';

export function useCrearCliente(): UseMutationResult<ClienteFila, ErrorApi, NuevoCliente> {
  const queryClient = useQueryClient();

  return useMutation<ClienteFila, ErrorApi, NuevoCliente>({
    mutationFn: (nuevo: NuevoCliente) => crearCliente(nuevo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useEditarCliente(id: string): UseMutationResult<ClienteFila, ErrorApi, PatchCliente> {
  const queryClient = useQueryClient();

  return useMutation<ClienteFila, ErrorApi, PatchCliente>({
    mutationFn: (datos: PatchCliente) => editarCliente(id, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['cliente', id] });
    },
  });
}

export function useCambiarEstadoCliente(
  id: string
): UseMutationResult<
  ClienteFila & { advertencia: string | null },
  ErrorApi,
  { activo: boolean; updatedAt: string }
> {
  const queryClient = useQueryClient();

  return useMutation<
    ClienteFila & { advertencia: string | null },
    ErrorApi,
    { activo: boolean; updatedAt: string }
  >({
    mutationFn: ({ activo, updatedAt }: { activo: boolean; updatedAt: string }) =>
      cambiarEstadoCliente(id, activo, updatedAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['cliente', id] });
    },
  });
}
