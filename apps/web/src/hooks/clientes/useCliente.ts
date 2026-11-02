import { useQuery } from '@tanstack/react-query';
import { obtenerCliente } from '../../lib/api-clientes.js';
import type { ErrorApi } from '../../lib/api.js';
import type { ClienteDetalle } from '@afull/shared';

export function useCliente(id: string | undefined) {
  return useQuery<ClienteDetalle, ErrorApi>({
    queryKey: ['cliente', id],
    queryFn: () => {
      if (!id) throw new Error('ID de cliente requerido');
      return obtenerCliente(id);
    },
    enabled: Boolean(id),
  });
}
