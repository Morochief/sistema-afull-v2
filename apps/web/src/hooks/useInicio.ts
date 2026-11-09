import { useQuery } from '@tanstack/react-query';
import { obtenerTablero } from '../lib/api-inicio.js';

/** Tablero de inicio: se refresca solo cada 30 s (mismo ritmo que "En vivo"). */
export function useInicio() {
  return useQuery({ queryKey: ['inicio'], queryFn: obtenerTablero, refetchInterval: 30_000 });
}
