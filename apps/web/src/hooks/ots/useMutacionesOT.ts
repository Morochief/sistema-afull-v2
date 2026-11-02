import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  crearOT,
  editarOT,
  transicionarOT,
  type NuevaOT,
  type PatchOT,
  type TransicionOT,
} from '../../lib/api-ots.js';
import type { ErrorApi } from '../../lib/api.js';
import type { OTFila } from '@afull/shared';

export function useCrearOT(): UseMutationResult<OTFila, ErrorApi, NuevaOT> {
  const queryClient = useQueryClient();

  return useMutation<OTFila, ErrorApi, NuevaOT>({
    mutationFn: (nueva: NuevaOT) => crearOT(nueva),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ots'] });
    },
  });
}

export function useEditarOT(id: string): UseMutationResult<OTFila, ErrorApi, PatchOT> {
  const queryClient = useQueryClient();

  return useMutation<OTFila, ErrorApi, PatchOT>({
    mutationFn: (datos: PatchOT) => editarOT(id, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ots'] });
      queryClient.invalidateQueries({ queryKey: ['ot', id] });
    },
  });
}

export function useTransicionarOT(id: string): UseMutationResult<OTFila, ErrorApi, TransicionOT> {
  const queryClient = useQueryClient();

  return useMutation<OTFila, ErrorApi, TransicionOT>({
    mutationFn: (datos: TransicionOT) => transicionarOT(id, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ots'] });
      queryClient.invalidateQueries({ queryKey: ['ot', id] });
    },
  });
}
