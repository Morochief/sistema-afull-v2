import { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { convertirPedido, descartarPedido, type PedidoFila } from '../../lib/api-portal.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { GaleriaArchivos } from '../archivos/GaleriaArchivos.js';

/** Resolver un pedido del portal: OT directa, presupuesto borrador o descartar con motivo (el cliente lo ve). */
export function ModalPedido({ pedido, onCerrar, onResuelto }: { pedido: PedidoFila | null; onCerrar: () => void; onResuelto: () => void }) {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [cargando, setCargando] = useState(false);
  if (!pedido) return null;
  const p = pedido;

  const hacer = async (fn: () => Promise<{ id: string; orden_trabajo_id?: string | null; presupuesto_id?: string | null }>, ok: string) => {
    setCargando(true);
    try {
      const r = await fn();
      toast.success(ok);
      onResuelto();
      if (r.orden_trabajo_id) void navigate({ to: '/ots/$id', params: { id: r.orden_trabajo_id } });
      else if (r.presupuesto_id) void navigate({ to: '/presupuestos/$id', params: { id: r.presupuesto_id } });
      else onCerrar();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo resolver el pedido'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>{p.numero} · {p.cliente_nombre}</DialogTitle>
        <DialogDescription>{p.sucursal_nombre ?? 'Sin local'} · {formatearFechaHora(p.created_at)}{p.cargado_por_contacto && ` · ${p.cargado_por_contacto}`}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <p className="whitespace-pre-wrap rounded border border-[#1f2937] bg-[#090a0f] p-2 text-neutral-200">{p.descripcion}</p>
        {p.fotos > 0 && <GaleriaArchivos refArchivo={{ pedidoId: p.id }} />}
        {p.foto_url && <a href={p.foto_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#ea580c] hover:underline">Ver foto <ExternalLink className="h-3 w-3" /></a>}
        {p.estado === 'NUEVO' ? (
          <>
            <Input aria-label="Título del trabajo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (opcional; si no, la descripción)" maxLength={255} />
            <div className="flex gap-2">
              <Input aria-label="Motivo del descarte" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo para descartar (lo ve el cliente)" />
              <Button variant="outline" disabled={cargando || motivo.trim().length < 3} onClick={() => void hacer(() => descartarPedido(p.id, motivo.trim()), 'Pedido descartado.')}>Descartar</Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-neutral-400">
            {p.estado === 'DESCARTADO' ? `Descartado: ${p.motivo_descarte}` : p.codigo_ot ? `Convertido en ${p.codigo_ot}` : `Convertido en ${p.presupuesto_numero}`}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={cargando}>Cerrar</Button>
        {p.estado === 'NUEVO' && (
          <>
            <Button variant="outline" disabled={cargando} onClick={() => void hacer(() => convertirPedido(p.id, 'PRESUPUESTO', titulo.trim() || undefined), 'Presupuesto creado en borrador.')}>Crear presupuesto</Button>
            <Button disabled={cargando} onClick={() => void hacer(() => convertirPedido(p.id, 'OT', titulo.trim() || undefined), 'OT creada.')}>Crear OT</Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}
