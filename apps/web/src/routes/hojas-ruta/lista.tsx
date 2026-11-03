import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { listarHojasRuta, listarVehiculos, crearHojaRuta } from '../../lib/api-campo.js';
import { mensajeDeError } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { Skeleton } from '../../components/ui/skeleton.js';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
const selectCls = 'h-9 w-full rounded-md border border-[#1f2937] bg-[#111318] px-2 text-sm text-neutral-100';
const ESTADO: Record<string, { t: string; v: 'neutral' | 'warning' | 'success' }> = {
  PLANIFICADA: { t: 'Planificada', v: 'neutral' },
  EN_CURSO: { t: 'En curso', v: 'warning' },
  FINALIZADA: { t: 'Terminada', v: 'success' },
};

/** Coordinación: hojas de ruta de la última semana y el próximo mes; alta rápida. */
export function HojasRutaListaPage() {
  const navigate = useNavigate();
  const { data: hojas, isLoading, refetch } = useQuery({ queryKey: ['hojas-ruta'], queryFn: () => listarHojasRuta() });
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: listarVehiculos });
  const [fecha, setFecha] = useState(hoy());
  const [descripcion, setDescripcion] = useState('');
  const [vehiculoId, setVehiculoId] = useState('');
  const [creando, setCreando] = useState(false);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreando(true);
    try {
      const h = await crearHojaRuta({ fecha, descripcion: descripcion.trim() || undefined, vehiculoId: vehiculoId || undefined });
      void refetch();
      navigate({ to: '/hojas-ruta/$id', params: { id: h.id } });
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo crear la hoja de ruta'));
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Hojas de ruta</h1>
        <p className="text-xs text-neutral-400">Qué cuadrilla sale, en qué vehículo y a qué OTs. La cuadrilla lo ve en "En la calle".</p>
      </div>
      <form onSubmit={crear} className="grid grid-cols-1 gap-3 rounded-md border border-[#1f2937] bg-[#111318] p-4 sm:grid-cols-4 sm:items-end">
        <div><Label htmlFor="hFecha">Fecha</Label><Input id="hFecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div><Label htmlFor="hDesc">Descripción</Label><Input id="hDesc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: Montajes zona Luque" /></div>
        <div>
          <Label htmlFor="hVehiculo">Vehículo</Label>
          <select id="hVehiculo" className={selectCls} value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
            <option value="">Sin vehículo</option>
            {vehiculos.filter((v) => v.activo).map((v) => <option key={v.id} value={v.id}>{v.chapa}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={creando} className="gap-1.5"><Plus className="h-4 w-4" /> Nueva hoja</Button>
      </form>
      <div className="rounded-md border border-[#1f2937] bg-[#111318]">
        {isLoading ? <Skeleton className="h-32 w-full" /> : (hojas ?? []).length === 0 ? (
          <p className="p-6 text-center text-xs text-neutral-500">No hay hojas de ruta en este período.</p>
        ) : (
          (hojas ?? []).map((h) => (
            <button key={h.id} type="button" onClick={() => navigate({ to: '/hojas-ruta/$id', params: { id: h.id } })} className="flex w-full items-center justify-between border-b border-[#1f2937] px-4 py-3 text-left text-xs last:border-0 hover:bg-[#161922]">
              <span>
                <span className="font-mono text-[#ea580c]">{h.fecha.split('-').reverse().join('/')}</span>
                <span className="ml-3 text-white">{h.descripcion || 'Sin descripción'}</span>
                <span className="ml-3 text-neutral-400">{h.chapa ?? 'sin vehículo'} · {h.personas} personas · {h.paradas} paradas</span>
              </span>
              <Badge variant={ESTADO[h.estado]?.v ?? 'neutral'}>{ESTADO[h.estado]?.t ?? h.estado}</Badge>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
