import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { obtenerCuadrilla, puedeMarcar, type ResultadoCuadrilla, type SalidaCuadrilla } from '../../lib/api-cuadrilla.js';
import { enviarOEncolar } from '../../lib/cola-offline.js';
import { huellaDispositivo, leerGps } from '../../lib/dispositivo.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { useMotivoRemoto } from '../../hooks/useMotivoRemoto.js';
import { Button } from '../ui/button.js';

type Tipo = 'ENTRADA' | 'SALIDA';

/** Loop 16: el conductor marca entrada o salida por los de su salida (con el GPS de su celular). */
function Salida({ s, onMarcado }: { s: SalidaCuadrilla; onMarcado: () => void }) {
  const adentro = s.personas.filter((p) => p.ultima_tipo === 'ENTRADA').length;
  // Sugerido: si la mayoría ya entró, lo que sigue es la salida (se recalcula al marcar).
  const sugerido: Tipo = adentro > s.personas.length / 2 ? 'SALIDA' : 'ENTRADA';
  const [tipo, setTipo] = useState<Tipo>(sugerido);
  useEffect(() => setTipo(sugerido), [sugerido]);
  const habilitadas = useMemo(() => s.personas.filter((p) => puedeMarcar(p, tipo)).map((p) => p.persona_id), [s.personas, tipo]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set(habilitadas));
  const [cargando, setCargando] = useState(false);
  const { conMotivo, modal } = useMotivoRemoto();
  useEffect(() => setElegidas(new Set(habilitadas)), [habilitadas]);
  const nombre = (id: string) => s.personas.find((p) => p.persona_id === id)?.nombre ?? 'alguien';
  const texto = tipo === 'ENTRADA' ? 'entrada' : 'salida';

  const marcar = async () => {
    setCargando(true);
    try {
      const gps = await leerGps();
      const datos = { hojaRutaId: s.hoja_ruta_id, tipo, gpsLat: gps.lat, gpsLng: gps.lng, precisionM: Math.round(gps.precision), dispositivoHash: huellaDispositivo(),
        personas: [...elegidas].map((personaId) => ({ personaId, claveIdempotencia: crypto.randomUUID() })) };
      const envio = await conMotivo((motivoRemoto?: string) =>
        enviarOEncolar<ResultadoCuadrilla>(`Marcar ${texto} de la cuadrilla`, '/api/asistencia/cuadrilla', motivoRemoto ? { ...datos, motivoRemoto } : datos));
      if (!envio) return;
      if (envio.encolada) {
        toast.info(`La ${texto} de ${elegidas.size} quedó guardada sin señal: se envía sola cuando vuelva.`, { duration: 8000 });
      } else {
        const { marcadas, rechazadas } = envio.respuesta;
        if (marcadas.length) toast.success(`${tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} marcada para ${marcadas.length} de la cuadrilla.`);
        for (const r of rechazadas) toast.warning(`${nombre(r.personaId)}: ${r.motivo}.`, { duration: 8000 });
      }
      onMarcado();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo marcar por la cuadrilla'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs" data-testid={`cuadrilla-${s.hoja_ruta_id}`}>
      {modal}
      <div className="mb-2 flex items-center gap-2 font-semibold text-white"><Users className="h-4 w-4" /> Cuadrilla{s.vehiculo ? ` · ${s.vehiculo}` : ''}</div>
      <div className="mb-2 flex gap-1.5" role="group" aria-label="Qué marcar">
        {(['ENTRADA', 'SALIDA'] as Tipo[]).map((t) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}
            className={`h-8 flex-1 rounded font-semibold ${tipo === t ? 'bg-[#ea580c] text-white' : 'border border-[#1f2937] text-neutral-300'}`}>{t === 'ENTRADA' ? 'Entrada' : 'Salida'}</button>
        ))}
      </div>
      <ul className="space-y-1.5">
        {s.personas.map((p) => {
          const ok = puedeMarcar(p, tipo);
          return (
            <li key={p.persona_id}>
              <label className={`flex min-h-[40px] items-center gap-2 ${ok ? 'text-neutral-200' : 'text-neutral-500'}`}>
                <input type="checkbox" disabled={!ok} checked={ok ? elegidas.has(p.persona_id) : p.ultima_tipo === tipo}
                  onChange={(e) => { const n = new Set(elegidas); if (e.target.checked) n.add(p.persona_id); else n.delete(p.persona_id); setElegidas(n); }} />
                <span className="flex-1">{p.nombre}{p.rol === 'CONDUCTOR' ? ' (vos)' : ''}</span>
                <span className="text-[11px] text-neutral-500">
                  {p.ultima_tipo ? `${p.ultima_tipo === 'ENTRADA' ? 'entró' : 'salió'} ${formatearFechaHora(p.ultima_at!).slice(-5)}` : 'sin marcar'}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button className="mt-3 min-h-[44px] w-full" disabled={cargando || elegidas.size === 0} onClick={() => void marcar()}>
        {cargando ? 'Ubicando…' : `Marcar ${texto} de ${elegidas.size}`}
      </Button>
    </section>
  );
}

export function CuadrillaCard({ onMarcado }: { onMarcado: () => void }) {
  const { data, refetch } = useQuery({ queryKey: ['asistencia', 'cuadrilla'], queryFn: obtenerCuadrilla, retry: false });
  if (!data?.salidas.length) return null;
  const listo = () => { void refetch(); onMarcado(); };
  return <>{data.salidas.map((s) => <Salida key={s.hoja_ruta_id} s={s} onMarcado={listo} />)}</>;
}
