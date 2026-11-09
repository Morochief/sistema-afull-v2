import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { BASE_SESION, listarArchivos, llamadorSesion, type Llamador, type RefArchivo } from '../../lib/api-archivos.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { mensajeDeError } from '../../lib/api.js';

type Props = { refArchivo: RefArchivo; llamar?: Llamador; base?: string; vacio?: string; habilitada?: boolean };

/**
 * Miniaturas de lo subido. Los enlaces son temporales (bucket privado): se piden de nuevo al abrir
 * la pantalla y vencen a los 10 minutos, por eso la consulta se da por vieja a los 5.
 */
export function GaleriaArchivos({ refArchivo, llamar = llamadorSesion, base = BASE_SESION, vacio, habilitada = true }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['archivos', base, refArchivo],
    queryFn: () => listarArchivos(llamar, base, refArchivo),
    enabled: habilitada,
    staleTime: 5 * 60_000,
  });
  if (isLoading) return <p className="text-xs text-neutral-500">Cargando fotos…</p>;
  if (error) return <p className="text-xs text-red-400">{mensajeDeError(error, 'No se pudieron cargar las fotos')}</p>;
  if (!data?.length) return vacio ? <p className="text-xs text-neutral-500">{vacio}</p> : null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Fotos y archivos">
      {data.map((a) => (
        <li key={a.id}>
          <a href={a.url} target="_blank" rel="noreferrer" className="block" title={`${a.subido_por} · ${formatearFechaHora(a.tomada_at)}${a.sin_senal ? ' · sin señal' : ''}`}>
            {a.mime === 'application/pdf' ? (
              <span className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded border border-[#1f2937] bg-[#0b0d12] text-[10px] text-neutral-300">
                <FileText className="h-6 w-6 text-[#ea580c]" /> PDF
              </span>
            ) : (
              <img src={a.url} alt={`Foto de ${a.subido_por}`} loading="lazy" className="h-20 w-20 rounded border border-[#1f2937] object-cover" />
            )}
          </a>
          <span className="mt-0.5 block w-20 truncate text-[10px] text-neutral-500">{formatearFechaHora(a.tomada_at)}</span>
        </li>
      ))}
    </ul>
  );
}
