import { useState } from 'react';
import { toast } from 'sonner';
import { MapPin } from 'lucide-react';
import type { MiDiaCampo } from '../../lib/api-campo.js';
import { enviarOEncolar } from '../../lib/cola-offline.js';
import { useColaOffline } from '../../hooks/useColaOffline.js';
import { huellaDispositivo, leerGps } from '../../lib/dispositivo.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { Button } from '../ui/button.js';

/** Marcar entrada o salida con el GPS. Fuera de la geocerca se registra igual (aviso, no bloqueo). */
export function MarcacionCard({ ultima, onMarcado }: { ultima: MiDiaCampo['ultima_marcacion']; onMarcado: () => void }) {
  const [cargando, setCargando] = useState(false);
  const { pendientes } = useColaOffline();
  // Si hay una marcación guardada sin señal, la próxima es la contraria a esa.
  const ultimaPendiente = [...pendientes].reverse().find((p) => p.url === '/api/asistencia/marcar')?.body as { tipo?: string } | undefined;
  const tipo = (ultimaPendiente?.tipo ?? ultima?.tipo) === 'ENTRADA' ? 'SALIDA' : 'ENTRADA';

  const marcar = async () => {
    setCargando(true);
    try {
      const gps = await leerGps();
      const texto = tipo === 'ENTRADA' ? 'Entrada' : 'Salida';
      const envio = await enviarOEncolar<{ dentro_geocerca: boolean; distancia_m: number | null; sede: string | null }>(`Marcar ${texto.toLowerCase()}`, '/api/asistencia/marcar', {
        tipo, gpsLat: gps.lat, gpsLng: gps.lng, precisionM: Math.round(gps.precision), dispositivoHash: huellaDispositivo(), claveIdempotencia: crypto.randomUUID(),
      });
      if (envio.encolada) toast.info(`${texto} guardada sin señal: se envía sola cuando vuelva (con la hora y el GPS de ahora).`, { duration: 8000 });
      else if (envio.respuesta.dentro_geocerca) toast.success(`${texto} registrada.`);
      else toast.warning(`${texto} registrada FUERA de zona${envio.respuesta.distancia_m ? ` (a ${Math.round(envio.respuesta.distancia_m)} m de ${envio.respuesta.sede})` : ''}. RR.HH. la va a ver marcada.`, { duration: 8000 });
      onMarcado();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo marcar'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="rounded-md border border-[#1f2937] bg-[#111318] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          <div className="font-semibold text-white">Asistencia</div>
          <div className="text-neutral-400">
            {ultima ? `Última: ${ultima.tipo === 'ENTRADA' ? 'entrada' : 'salida'} ${formatearFechaHora(ultima.marcada_at)}${ultima.dentro_geocerca ? '' : ' (fuera de zona)'}` : 'Sin marcaciones'}
          </div>
        </div>
        <Button onClick={() => void marcar()} disabled={cargando} className="min-h-[44px] gap-1.5">
          <MapPin className="h-4 w-4" /> {cargando ? 'Ubicando…' : `Marcar ${tipo === 'ENTRADA' ? 'entrada' : 'salida'}`}
        </Button>
      </div>
    </section>
  );
}
