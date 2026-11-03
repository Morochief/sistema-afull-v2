import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Navigation, XCircle } from 'lucide-react';
import { completarParada, omitirParada, type MiDiaCampo } from '../../lib/api-campo.js';
import { enlaceMapa } from '../../lib/dispositivo.js';
import { mensajeDeError } from '../../lib/api.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';

type Hoja = MiDiaCampo['hojas'][number];

/** Paradas de una hoja de ruta de hoy: cómo llegar, completar u omitir (con motivo). */
export function ParadasHoja({ hoja, onCambio }: { hoja: Hoja; onCambio: () => void }) {
  const [omitiendo, setOmitiendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const accion = async (id: string, completar: boolean) => {
    try {
      const r = completar ? await completarParada(id) : await omitirParada(id, motivo.trim());
      if (r.hoja_finalizada) toast.success('¡Hoja de ruta terminada!');
      setOmitiendo(null);
      setMotivo('');
      onCambio();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo actualizar la parada'));
    }
  };

  return (
    <section className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white">{hoja.descripcion || 'Hoja de ruta'}{hoja.chapa && ` · ${hoja.chapa}`}</span>
        <Badge variant={hoja.estado === 'FINALIZADA' ? 'success' : 'warning'}>{hoja.estado === 'EN_CURSO' ? 'En curso' : hoja.estado === 'FINALIZADA' ? 'Terminada' : 'Planificada'}</Badge>
      </div>
      {hoja.paradas.map((p) => {
        const mapa = enlaceMapa(p.gps_lat, p.gps_lng, p.direccion);
        return (
          <div key={p.id} className="space-y-2 border-t border-[#1f2937] pt-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-white">{p.orden}. {p.cliente}{p.sucursal && ` · ${p.sucursal}`}{p.tipo === 'EXTRA' && ' (extra)'}</div>
                <div className="text-neutral-400">{p.codigo_ot} · {p.titulo}{p.hora_estimada && ` · ${p.hora_estimada.slice(0, 5)}`}</div>
              </div>
              {p.estado !== 'PENDIENTE' && <Badge variant={p.estado === 'COMPLETADA' ? 'success' : 'danger'}>{p.estado === 'COMPLETADA' ? 'Hecha' : 'Omitida'}</Badge>}
            </div>
            {p.estado === 'PENDIENTE' && (
              omitiendo === p.id ? (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) void accion(p.id, false); }}>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué no se hizo?" className="h-10 text-xs" autoFocus />
                  <Button type="submit" className="h-10 text-xs" disabled={!motivo.trim()}>Omitir</Button>
                </form>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {mapa ? (
                    <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-md border border-[#1f2937] text-neutral-200">
                      <Navigation className="h-3.5 w-3.5" /> Ir
                    </a>
                  ) : <span />}
                  <Button variant="outline" className="min-h-[40px] gap-1 text-xs" onClick={() => setOmitiendo(p.id)}><XCircle className="h-3.5 w-3.5" /> Omitir</Button>
                  <Button className="min-h-[40px] gap-1 text-xs" onClick={() => void accion(p.id, true)}><CheckCircle2 className="h-3.5 w-3.5" /> Hecha</Button>
                </div>
              )
            )}
          </div>
        );
      })}
    </section>
  );
}
