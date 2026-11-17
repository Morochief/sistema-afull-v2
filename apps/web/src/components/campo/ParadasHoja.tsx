import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Navigation, Package, XCircle } from 'lucide-react';
import type { MiDiaCampo } from '../../lib/api-campo.js';
import { enviarOEncolar } from '../../lib/cola-offline.js';
import { useColaOffline } from '../../hooks/useColaOffline.js';
import { enlaceMapa } from '../../lib/dispositivo.js';
import { mensajeDeError } from '../../lib/api.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { ModalCargarMaterial } from '../insumos/ModalCargarMaterial.js';
import { FotoMontaje } from './FotoMontaje.js';
import { ModalEntregaParada } from './ModalEntregaParada.js';

type Hoja = MiDiaCampo['hojas'][number];

/** Paradas de una salida de hoy: cómo llegar, completar u omitir (con motivo). */
export function ParadasHoja({ hoja, onCambio }: { hoja: Hoja; onCambio: () => void }) {
  const [omitiendo, setOmitiendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [material, setMaterial] = useState<Hoja['paradas'][number] | null>(null);
  const [entregando, setEntregando] = useState<Hoja['paradas'][number] | null>(null);
  const { pendientes } = useColaOffline();
  const porEnviar = (id: string) => pendientes.find((p) => p.url.startsWith(`/api/campo/paradas/${id}/`));

  // "Hecha" pasa por la constancia de entrega (Loop 17); acá queda omitir.
  const omitir = async (id: string) => {
    try {
      const parada = hoja.paradas.find((x) => x.id === id);
      const envio = await enviarOEncolar<{ hoja_finalizada?: boolean }>(`Parada omitida: ${parada?.codigo_ot ?? ''}`, `/api/campo/paradas/${id}/omitir`, { motivo: motivo.trim() });
      if (envio.encolada) toast.info('Guardado sin señal: se envía solo cuando vuelva.');
      else if (envio.respuesta.hoja_finalizada) toast.success('¡Salida terminada!');
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
        <span className="font-semibold text-white">{hoja.descripcion || 'Salida'}{hoja.chapa && ` · ${hoja.chapa}`}</span>
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
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-[11px]" onClick={() => setMaterial(p)} aria-label={`Material ${p.codigo_ot}`}><Package className="h-3.5 w-3.5" /> Material</Button>
                {p.estado === 'COMPLETADA' && p.receptor_nombre && <span className="text-[11px] text-neutral-400">Recibió {p.receptor_nombre}</span>}
                {p.estado !== 'PENDIENTE' && <Badge variant={p.estado === 'COMPLETADA' ? 'success' : 'danger'}>{p.estado === 'COMPLETADA' ? 'Hecha' : 'Omitida'}</Badge>}
              </div>
            </div>
            <FotoMontaje paradaId={p.id} codigoOt={p.codigo_ot} />
            {p.estado === 'PENDIENTE' && porEnviar(p.id) && <p className="text-amber-300">{porEnviar(p.id)!.url.endsWith('/completar') ? 'Hecha' : 'Omitida'} · se envía cuando vuelva la señal</p>}
            {p.estado === 'PENDIENTE' && !porEnviar(p.id) && (
              omitiendo === p.id ? (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) void omitir(p.id); }}>
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
                  <Button className="min-h-[40px] gap-1 text-xs" onClick={() => setEntregando(p)}><CheckCircle2 className="h-3.5 w-3.5" /> Hecha</Button>
                </div>
              )
            )}
          </div>
        );
      })}
      <ModalEntregaParada parada={entregando} onCerrar={() => setEntregando(null)}
        onHecha={(terminada) => { if (terminada) toast.success('¡Salida terminada!'); setEntregando(null); onCambio(); }} />
      {material && <ModalCargarMaterial otId={material.orden_trabajo_id} titulo={`${material.codigo_ot} · ${material.titulo}`} onCerrar={() => setMaterial(null)} />}
    </section>
  );
}
