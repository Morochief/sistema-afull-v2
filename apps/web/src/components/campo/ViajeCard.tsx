import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { listarVehiculos, type MiDiaCampo } from '../../lib/api-campo.js';
import { enviarOEncolar } from '../../lib/cola-offline.js';
import { guardarFoto } from '../../lib/fotos-pendientes.js';
import { BotonFoto } from '../archivos/BotonFoto.js';
import { useColaOffline } from '../../hooks/useColaOffline.js';
import { leerGps } from '../../lib/dispositivo.js';
import { numero } from '../../lib/numero.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

type Props = { dia: MiDiaCampo; onCambio: () => void };
const selectCls = 'h-10 w-full rounded-md border border-[#1f2937] bg-[#111318] px-2 text-sm text-neutral-100';

/** GPS opcional en el viaje: si no hay permiso o tarda, el odómetro se registra igual. */
const gpsOpcional = () => leerGps(8000).catch(() => null);

/** Odómetro al salir y al volver. Si el servidor pide un motivo (km menores o desvío), aparece el campo. */
export function ViajeCard({ dia, onCambio }: Props) {
  const abierto = dia.viaje_abierto;
  const hojaConVehiculo = dia.hojas.find((h) => h.vehiculo_id);
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: listarVehiculos, enabled: !abierto });
  const [vehiculoId, setVehiculoId] = useState(hojaConVehiculo?.vehiculo_id ?? '');
  const [km, setKm] = useState('');
  const [motivo, setMotivo] = useState('');
  const [pideMotivo, setPideMotivo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // Foto del odómetro: obligatoria (L4.E3). Queda en el celular y sube sola, aunque no haya señal.
  const [foto, setFoto] = useState<{ blob: Blob; mime: string } | null>(null);
  const { pendientes } = useColaOffline();
  const inicioPendiente = pendientes.find((p) => p.url === '/api/campo/viajes/iniciar');
  const cierrePendiente = abierto && pendientes.find((p) => p.url === `/api/campo/viajes/${abierto.id}/cerrar`);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = numero(km);
    if (!(valor >= 0) || Math.round(valor * 10) !== valor * 10) {
      toast.error('Kilómetros del odómetro, con hasta 1 decimal');
      return;
    }
    if (!foto) {
      toast.error('Sacale una foto al odómetro');
      return;
    }
    setCargando(true);
    try {
      const gps = await gpsOpcional();
      const clave = crypto.randomUUID();
      const base = { gpsLat: gps?.lat, gpsLng: gps?.lng, claveIdempotencia: clave };
      if (abierto) {
        const envio = await enviarOEncolar<{ recorrido_km: number; alerta_desvio: boolean }>(`Cerrar viaje (${valor} km)`, `/api/campo/viajes/${abierto.id}/cerrar`, { ...base, kmFin: valor, motivoDesvio: motivo.trim() || undefined });
        await guardarFoto({ etiqueta: `Foto del odómetro (${valor} km)`, tipo: 'ODOMETRO_FIN', ref: { viajeId: abierto.id }, ...foto });
        if (envio.encolada) toast.info('Cierre guardado sin señal: se envía solo cuando vuelva.');
        else toast.success(`Viaje cerrado: ${envio.respuesta.recorrido_km} km${envio.respuesta.alerta_desvio ? ' (con desvío informado)' : ''}.`);
      } else {
        if (!vehiculoId) throw new Error('Elegí el vehículo');
        const hoja = dia.hojas.find((h) => !h.vehiculo_id || h.vehiculo_id === vehiculoId);
        const envio = await enviarOEncolar(`Iniciar viaje (${valor} km)`, '/api/campo/viajes/iniciar', { ...base, vehiculoId, hojaRutaId: hoja?.id, kmInicio: valor, motivoKmInicio: motivo.trim() || undefined });
        // La foto se ata a la clave del viaje: si el inicio quedó sin señal, sube después de que llegue.
        await guardarFoto({ etiqueta: `Foto del odómetro (${valor} km)`, tipo: 'ODOMETRO_INICIO', ref: { claveViaje: clave }, ...foto });
        toast.success(envio.encolada ? 'Inicio guardado sin señal: se envía solo cuando vuelva.' : 'Viaje iniciado. ¡Buen viaje!');
      }
      setKm('');
      setFoto(null);
      setMotivo('');
      setPideMotivo(null);
      onCambio();
    } catch (er) {
      const msj = mensajeDeError(er, 'No se pudo registrar el odómetro');
      if (/motivo/i.test(msj)) setPideMotivo(msj);
      else toast.error(msj);
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-white">
        <Truck className="h-4 w-4 text-[#ea580c]" />
        {abierto ? `Viaje en curso · ${abierto.chapa} · salió con ${abierto.km_inicio} km a las ${formatearFechaHora(abierto.hora_inicio)}` : 'Vehículo'}
      </div>
      {inicioPendiente || cierrePendiente ? (
        <p className="text-xs text-amber-300">
          {inicioPendiente ? 'El inicio del viaje está guardado sin señal. Vas a poder cerrarlo cuando se envíe.' : 'El cierre está guardado sin señal y se envía solo.'}
        </p>
      ) : (
      <form onSubmit={enviar} className="space-y-3">
        {!abierto && (
          <select aria-label="Vehículo" className={selectCls} value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
            <option value="">Elegí el vehículo…</option>
            {vehiculos.filter((v) => v.activo).map((v) => <option key={v.id} value={v.id}>{v.chapa} · {v.marca_modelo}</option>)}
            {/* Sin señal la lista no baja: al menos el vehículo de la hoja de hoy. */}
            {vehiculos.length === 0 && hojaConVehiculo?.vehiculo_id && <option value={hojaConVehiculo.vehiculo_id}>{hojaConVehiculo.chapa}</option>}
          </select>
        )}
        <div>
          <Label htmlFor="kmOdometro">{abierto ? 'Odómetro al volver (km)' : 'Odómetro al salir (km)'}</Label>
          <Input id="kmOdometro" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} className="h-10" />
        </div>
        <div className="flex items-center gap-2">
          <BotonFoto etiqueta={foto ? 'Sacar otra' : 'Foto del odómetro'} onArchivo={setFoto} variant={foto ? 'outline' : 'secondary'} />
          {foto ? <span className="text-xs text-emerald-400" data-testid="foto-odometro-lista">Foto lista ✓</span> : <span className="text-xs text-neutral-500">Obligatoria</span>}
        </div>
        {pideMotivo && (
          <div>
            <p className="mb-1 text-xs text-amber-400">{pideMotivo}</p>
            <Input id="motivoViaje" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" className="h-10" autoFocus />
          </div>
        )}
        <Button type="submit" disabled={cargando} className="min-h-[44px] w-full">
          {cargando ? 'Registrando…' : abierto ? 'Cerrar viaje' : 'Iniciar viaje'}
        </Button>
      </form>
      )}
    </section>
  );
}
