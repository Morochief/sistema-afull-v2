import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { listarVehiculos, crearVehiculo, editarVehiculo, listarSedes, crearSede, editarSede } from '../lib/api-campo.js';
import { leerGps } from '../lib/dispositivo.js';
import { numero } from '../lib/numero.js';
import { mensajeDeError } from '../lib/api.js';
import { formatearGs } from '../lib/formato.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';

/** Flota y sedes (solo admin): vehículos con su costo por km y la geocerca de asistencia. */
export function FlotaPage() {
  const vehiculos = useQuery({ queryKey: ['vehiculos'], queryFn: listarVehiculos });
  const sedes = useQuery({ queryKey: ['sedes'], queryFn: listarSedes });
  const [chapa, setChapa] = useState('');
  const [modelo, setModelo] = useState('');
  const [costoKm, setCostoKm] = useState('');
  const [sede, setSede] = useState({ nombre: '', lat: '', lng: '', radio: '100' });

  const hacer = async (fn: () => Promise<unknown>, ok: string, despues: () => void) => {
    try {
      await fn();
      toast.success(ok);
      despues();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo guardar'));
    }
  };
  const usarMiUbicacion = async () => {
    try {
      const g = await leerGps();
      setSede((s) => ({ ...s, lat: g.lat.toFixed(7), lng: g.lng.toFixed(7) }));
    } catch (e) {
      toast.error(mensajeDeError(e, 'Sin ubicación'));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight text-white">Flota y sedes</h1>
      <section className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs">
        <h2 className="font-semibold uppercase tracking-wider text-neutral-400">Vehículos</h2>
        {(vehiculos.data ?? []).map((v) => (
          <div key={v.id} className="flex items-center justify-between border-t border-[#1f2937] pt-2">
            <span className={v.activo ? 'text-white' : 'text-neutral-500 line-through'}>{v.chapa} · {v.marca_modelo} · {formatearGs(v.costo_km_gs)}/km</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void hacer(() => editarVehiculo(v.id, { activo: !v.activo }), v.activo ? 'Vehículo desactivado.' : 'Vehículo reactivado.', () => void vehiculos.refetch())}>
              {v.activo ? 'Desactivar' : 'Reactivar'}
            </Button>
          </div>
        ))}
        <form className="grid grid-cols-1 gap-2 border-t border-[#1f2937] pt-2 sm:grid-cols-4" onSubmit={(e) => {
          e.preventDefault();
          void hacer(() => crearVehiculo({ chapa: chapa.trim(), marcaModelo: modelo.trim(), costoKmGs: numero(costoKm || '0') }), 'Vehículo agregado.', () => { setChapa(''); setModelo(''); setCostoKm(''); void vehiculos.refetch(); });
        }}>
          <Input aria-label="Chapa" value={chapa} onChange={(e) => setChapa(e.target.value)} placeholder="Chapa" />
          <Input aria-label="Marca y modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Marca y modelo" />
          <Input aria-label="Costo por km" inputMode="decimal" value={costoKm} onChange={(e) => setCostoKm(e.target.value)} placeholder="Costo por km (Gs.)" />
          <Button type="submit" disabled={!chapa.trim() || !modelo.trim()}>Agregar vehículo</Button>
        </form>
      </section>
      <section className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs">
        <h2 className="font-semibold uppercase tracking-wider text-neutral-400">Sedes (geocerca de asistencia)</h2>
        {(sedes.data ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between border-t border-[#1f2937] pt-2">
            <span className={s.activo ? 'text-white' : 'text-neutral-500 line-through'}>{s.nombre} · {s.gps_lat}, {s.gps_lng} · radio {s.radio_m} m</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void hacer(() => editarSede(s.id, { activo: !s.activo }), 'Sede actualizada.', () => void sedes.refetch())}>
              {s.activo ? 'Desactivar' : 'Reactivar'}
            </Button>
          </div>
        ))}
        <form className="grid grid-cols-1 gap-2 border-t border-[#1f2937] pt-2 sm:grid-cols-5" onSubmit={(e) => {
          e.preventDefault();
          void hacer(() => crearSede({ nombre: sede.nombre.trim(), gpsLat: Number(sede.lat), gpsLng: Number(sede.lng), radioM: Number(sede.radio) }), 'Sede agregada.', () => { setSede({ nombre: '', lat: '', lng: '', radio: '100' }); void sedes.refetch(); });
        }}>
          <Input aria-label="Nombre de la sede" value={sede.nombre} onChange={(e) => setSede({ ...sede, nombre: e.target.value })} placeholder="Nombre (ej. Fábrica)" />
          <Input aria-label="Latitud" value={sede.lat} onChange={(e) => setSede({ ...sede, lat: e.target.value })} placeholder="Latitud (-25.32…)" />
          <Input aria-label="Longitud" value={sede.lng} onChange={(e) => setSede({ ...sede, lng: e.target.value })} placeholder="Longitud (-57.62…)" />
          <Input aria-label="Radio" value={sede.radio} onChange={(e) => setSede({ ...sede, radio: e.target.value })} placeholder="Radio (m)" />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void usarMiUbicacion()}>Mi ubicación</Button>
            <Button type="submit" disabled={!sede.nombre.trim() || !sede.lat || !sede.lng}>Agregar</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
