import { ESTADO_OT_CLIENTE, estadoPedidoCliente } from '@afull/shared';
import type { PortalOT, PortalPedido } from '../../lib/api-portal.js';
import { formatearDia } from '../../lib/fechas.js';
import { Badge, type BadgeVariant } from '../ui/badge.js';
import { FotosPedidoPortal } from './FotosPedidoPortal.js';

const colorOT = (e: string): BadgeVariant => (e === 'TERMINADO' ? 'success' : e === 'CANCELADO' ? 'danger' : e === 'PENDIENTE' ? 'neutral' : 'warning');

export function ListaTrabajos({ ots }: { ots: PortalOT[] }) {
  if (ots.length === 0) return <p className="text-sm text-neutral-500">Todavía no hay trabajos.</p>;
  return (
    <ul className="space-y-2" data-testid="portal-trabajos">
      {ots.map((o) => (
        <li key={o.id} className="flex items-start justify-between gap-3 rounded-md border border-[#1f2937] bg-[#111318] p-3 text-sm">
          <div>
            <div className="font-medium text-white">{o.titulo}</div>
            <div className="text-xs text-neutral-400">{o.codigo_ot}{o.sucursal && ` · ${o.sucursal}`}{o.fecha_prometida && ` · para el ${formatearDia(o.fecha_prometida)}`}</div>
          </div>
          <Badge variant={colorOT(o.estado)}>{ESTADO_OT_CLIENTE[o.estado] ?? o.estado}</Badge>
        </li>
      ))}
    </ul>
  );
}

export function ListaPedidos({ pedidos, token, onCambio }: { pedidos: PortalPedido[]; token: string; onCambio: () => void }) {
  if (pedidos.length === 0) return <p className="text-sm text-neutral-500">Todavía no hiciste pedidos.</p>;
  return (
    <ul className="space-y-2" data-testid="portal-pedidos">
      {pedidos.map((p) => {
        const e = estadoPedidoCliente(p);
        return (
          <li key={p.id} className="space-y-1 rounded-md border border-[#1f2937] bg-[#111318] p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono text-xs text-neutral-400">{p.numero}{p.sucursal && ` · ${p.sucursal}`} · {formatearDia(p.created_at)}</span>
              <Badge variant={e.tono}>{e.texto}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-neutral-200">{p.descripcion}</p>
            {p.codigo_ot && <p className="text-xs text-neutral-400">Trabajo {p.codigo_ot}</p>}
            {p.motivo_descarte && <p className="text-xs text-neutral-400">Motivo: {p.motivo_descarte}</p>}
            <FotosPedidoPortal token={token} pedido={p} onCambio={onCambio} />
          </li>
        );
      })}
    </ul>
  );
}
