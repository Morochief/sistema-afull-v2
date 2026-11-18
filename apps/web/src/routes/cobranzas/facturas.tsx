import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Receipt } from 'lucide-react';
import type { EstadoFactura, FacturaFila } from '@afull/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useListadoUrl } from '../../hooks/useListadoUrl.js';
import { anularFactura, listarFacturas, refrescarCobranzas, type PaginaFacturas } from '../../lib/api-cobranzas.js';
import { TablaAdmin } from '../../components/tabla/TablaAdmin.js';
import type { Columna } from '../../components/tabla/tipos.js';
import { Button } from '../../components/ui/button.js';
import { Badge, type BadgeVariant } from '../../components/ui/badge.js';
import { formatearFechaDate } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';
import { PestanasCobranzas } from '../../components/cobranzas/PestanasCobranzas.js';
import { ModalNuevaFactura } from '../../components/cobranzas/ModalNuevaFactura.js';
import { ModalNuevoRecibo } from '../../components/cobranzas/ModalNuevoRecibo.js';
import { ModalAnular } from '../../components/cobranzas/ModalAnular.js';

const ESTADO: Record<EstadoFactura, { texto: string; variant: BadgeVariant }> = {
  PENDIENTE: { texto: 'Pendiente', variant: 'warning' },
  PARCIAL: { texto: 'Pago parcial', variant: 'default' },
  PAGADA: { texto: 'Pagada', variant: 'success' },
  ANULADA: { texto: 'Anulada', variant: 'neutral' },
};

/** Loop 21: facturas emitidas y su saldo; desde acá se cobra (recibo) o se anula una mal cargada. */
export function CobranzasFacturasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { datos, estado, filtros, setFiltros, reintentar } = useListadoUrl<FacturaFila, PaginaFacturas>('/cobranzas', 'cobranzas-facturas', listarFacturas);
  const [nueva, setNueva] = useState(false);
  const [cobrar, setCobrar] = useState<FacturaFila | null>(null);
  const [reciboAbierto, setReciboAbierto] = useState(false);
  const [anular, setAnular] = useState<FacturaFila | null>(null);

  const columnas: Columna<FacturaFila>[] = [
    { id: 'numero', encabezado: 'Factura', ancho: 'w-40', celda: (f) => <span className="font-mono font-semibold text-[#ea580c]">{f.numero}</span> },
    { id: 'cliente', encabezado: 'Cliente', celda: (f) => <span className="text-white">{f.cliente_nombre}</span> },
    { id: 'fecha', encabezado: 'Fecha', ancho: 'w-24', celda: (f) => <span className="font-mono text-xs text-neutral-400">{formatearFechaDate(f.fecha)}</span> },
    { id: 'monto', encabezado: 'Monto', ancho: 'w-32', alinear: 'der', celda: (f) => <span className="font-mono text-xs">{formatearGs(f.monto_gs)}</span> },
    { id: 'saldo', encabezado: 'Saldo', ancho: 'w-32', alinear: 'der', celda: (f) => <span className="font-mono text-xs font-semibold text-white">{formatearGs(f.saldo_gs)}</span> },
    { id: 'estado', encabezado: 'Estado', ancho: 'w-28', celda: (f) => <Badge variant={ESTADO[f.estado].variant}>{ESTADO[f.estado].texto}</Badge> },
    {
      id: 'acciones', encabezado: '', ancho: 'w-40', alinear: 'der',
      celda: (f) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {f.saldo_gs > 0 && <Button size="sm" onClick={() => { setCobrar(f); setReciboAbierto(true); }}>Cobrar</Button>}
          {f.estado === 'PENDIENTE' && <Button size="sm" variant="ghost" onClick={() => setAnular(f)}>Anular</Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <PestanasCobranzas actual="facturas" />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setCobrar(null); setReciboAbierto(true); }} className="gap-1.5"><Receipt className="h-4 w-4" />Nuevo recibo</Button>
          <Button onClick={() => setNueva(true)} className="gap-1.5"><Plus className="h-4 w-4" />Cargar factura</Button>
        </div>
      </div>
      {datos && <p className="text-xs text-neutral-400">Saldo por cobrar con este filtro: <b className="font-mono text-white">{formatearGs(datos.saldo_total_gs)}</b></p>}
      <TablaAdmin
        columnas={columnas} datos={datos} estado={estado} filtros={filtros} onFiltros={setFiltros}
        opcionesEstado={[
          { valor: 'todos', etiqueta: 'Con saldo' }, { valor: 'TODAS', etiqueta: 'Todas' },
          ...(['PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA'] as const).map((e) => ({ valor: e, etiqueta: ESTADO[e].texto })),
        ]}
        claveFila={(f) => f.id}
        textoBusqueda="Buscar por número de factura o cliente..."
        vacio={{ titulo: 'Sin facturas', descripcion: 'Cargá las facturas que emitiste para llevar lo que falta cobrar.' }}
        onReintentar={reintentar}
      />
      <ModalNuevaFactura abierto={nueva} onCerrar={() => setNueva(false)} />
      <ModalNuevoRecibo abierto={reciboAbierto} onCerrar={() => setReciboAbierto(false)}
        clienteInicial={cobrar ? { id: cobrar.cliente_id, nombre: cobrar.cliente_nombre } : null} facturaInicial={cobrar?.id}
        onCreado={(id) => navigate({ to: '/cobranzas/recibos/$id', params: { id } })} />
      <ModalAnular titulo={anular ? `factura ${anular.numero}` : null} onCerrar={() => setAnular(null)}
        aviso="Solo si se cargó por error. La factura en sí la anulás en tu sistema de facturación."
        onAnular={async (m) => { await anularFactura(anular!.id, m); await refrescarCobranzas(qc); }} />
    </div>
  );
}
