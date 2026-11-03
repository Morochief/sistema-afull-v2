import { useQuery } from '@tanstack/react-query';
import { miDiaCampoConRespaldo } from '../lib/api-campo.js';
import { EstadoConexion } from '../components/campo/EstadoConexion.js';
import { formatearFechaHora } from '../lib/fechas.js';
import { mensajeDeError, type ErrorApi } from '../lib/api.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { Button } from '../components/ui/button.js';
import { MarcacionCard } from '../components/campo/MarcacionCard.js';
import { ViajeCard } from '../components/campo/ViajeCard.js';
import { ParadasHoja } from '../components/campo/ParadasHoja.js';

/** "En la calle": la pantalla del celular de la cuadrilla. Marcación, odómetro y paradas de hoy. */
export function CallePage() {
  const { data: dia, isLoading, error, refetch } = useQuery({ queryKey: ['campo', 'hoy'], queryFn: miDiaCampoConRespaldo, refetchInterval: 60_000 });
  const recargar = () => void refetch();

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (error || !dia) {
    return (
      <div className="rounded-md border border-red-900/40 bg-red-950/10 p-6 text-center text-xs">
        <p className="mb-3 text-red-300">{mensajeDeError(error as ErrorApi, 'No se pudo cargar tu día')}</p>
        <Button size="sm" onClick={recargar}>Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">En la calle</h1>
        <p className="text-xs text-neutral-400">{dia.persona.nombre} · hoy {dia.fecha.split('-').reverse().join('/')}</p>
      </div>
      <EstadoConexion alEnviar={recargar} />
      {dia.sin_conexion && <p className="text-[11px] text-amber-300">Sin señal: mostrando lo bajado el {formatearFechaHora(dia.sin_conexion)}.</p>}
      <MarcacionCard ultima={dia.ultima_marcacion} onMarcado={recargar} />
      <ViajeCard key={dia.viaje_abierto?.id ?? 'sin-viaje'} dia={dia} onCambio={recargar} />
      {dia.hojas.length === 0 ? (
        <p className="rounded-md border border-[#1f2937] bg-[#111318] p-4 text-center text-xs text-neutral-500">No tenés hoja de ruta para hoy.</p>
      ) : (
        dia.hojas.map((h) => <ParadasHoja key={h.id} hoja={h} onCambio={recargar} />)
      )}
    </div>
  );
}
