import { useState } from 'react';
import { toast } from 'sonner';
import { MapPin } from 'lucide-react';
import { marcarAsistencia, type MiDiaCampo } from '../../lib/api-campo.js';
import { huellaDispositivo, leerGps } from '../../lib/dispositivo.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { Button } from '../ui/button.js';

/** Marcar entrada o salida con el GPS. Fuera de la geocerca se registra igual (aviso, no bloqueo). */
export function MarcacionCard({ ultima, onMarcado }: { ultima: MiDiaCampo['ultima_marcacion']; onMarcado: () => void }) {
  const [cargando, setCargando] = useState(false);
  const tipo = ultima?.tipo === 'ENTRADA' ? 'SALIDA' : 'ENTRADA';

  const marcar = async () => {
    setCargando(true);
    try {
      const gps = await leerGps();
      const r = await marcarAsistencia({
        tipo,
        gpsLat: gps.lat,
        gpsLng: gps.lng,
        precisionM: Math.round(gps.precision),
        dispositivoHash: huellaDispositivo(),
        claveIdempotencia: crypto.randomUUID(),
      });
      if (r.dentro_geocerca) toast.success(`${tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada.`);
      else toast.warning(`${tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada FUERA de zona${r.distancia_m ? ` (a ${Math.round(r.distancia_m)} m de ${r.sede})` : ''}. RR.HH. la va a ver marcada.`, { duration: 8000 });
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
