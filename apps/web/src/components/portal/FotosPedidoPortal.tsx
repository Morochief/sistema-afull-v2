import { useState } from 'react';
import { toast } from 'sonner';
import { MAX_POR_REFERENCIA } from '@afull/shared';
import type { PortalPedido } from '../../lib/api-portal.js';
import { BASE_PORTAL, llamadorPortal, subirArchivo } from '../../lib/api-archivos.js';
import { mensajeDeError } from '../../lib/api.js';
import { BotonFoto } from '../archivos/BotonFoto.js';
import { GaleriaArchivos } from '../archivos/GaleriaArchivos.js';

/** Fotos de un pedido en el portal: se ven siempre; se agregan mientras el pedido no fue atendido. */
export function FotosPedidoPortal({ token, pedido, onCambio }: { token: string; pedido: PortalPedido; onCambio: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const puedeAgregar = pedido.estado === 'NUEVO' && pedido.fotos < MAX_POR_REFERENCIA.FOTO_PEDIDO;
  const llamar = llamadorPortal(token);
  const agregar = async (a: { blob: Blob; mime: string }) => {
    setSubiendo(true);
    try {
      await subirArchivo(llamar, BASE_PORTAL, { tipo: 'FOTO_PEDIDO', pedidoId: pedido.id, ...a, claveIdempotencia: crypto.randomUUID() });
      toast.success('Foto agregada.');
      onCambio();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo subir la foto'));
    } finally {
      setSubiendo(false);
    }
  };
  if (pedido.fotos === 0 && !puedeAgregar) return null;
  return (
    <div className="space-y-2">
      {pedido.fotos > 0 && <GaleriaArchivos refArchivo={{ pedidoId: pedido.id }} llamar={llamar} base={BASE_PORTAL} />}
      {puedeAgregar && <BotonFoto etiqueta={subiendo ? 'Subiendo…' : 'Agregar foto'} onArchivo={agregar} disabled={subiendo} className="h-8 gap-1 text-xs" />}
    </div>
  );
}
