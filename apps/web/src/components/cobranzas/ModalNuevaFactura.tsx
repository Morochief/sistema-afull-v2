import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { ClienteFila } from '@afull/shared';
import { crearFactura, hoyAsuncion, leerGs, refrescarCobranzas } from '../../lib/api-cobranzas.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { SelectorClienteOT } from '../forms/SelectorClienteOT.js';

type Props = { abierto: boolean; onCerrar: () => void };

/** Cargar una factura que aFull ya emitió con su sistema de facturación electrónica (para poder cobrarla). */
export function ModalNuevaFactura({ abierto, onCerrar }: Props) {
  const qc = useQueryClient();
  const [cliente, setCliente] = useState<ClienteFila | null>(null);
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(hoyAsuncion);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);

  const cerrar = () => {
    setCliente(null); setNumero(''); setFecha(hoyAsuncion()); setMonto(''); setNota(''); setErrores({});
    onCerrar();
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    const nro = numero.trim();
    const gs = leerGs(monto);
    if (!cliente) err.cliente = 'Elegí un cliente';
    if (!/^\d{3}-\d{3}-\d{7}$/.test(nro)) err.numero = 'Como figura en la factura: 001-001-0000123';
    if (!gs) err.monto = 'Monto en guaraníes, sin decimales';
    if (!fecha) err.fecha = 'Fecha de la factura';
    setErrores(err);
    if (Object.keys(err).length > 0 || !cliente || !gs) return;
    setCargando(true);
    try {
      const f = await crearFactura({ numero: nro, clienteId: cliente.id, fecha, montoGs: gs, nota: nota.trim() || undefined });
      toast.success(`Factura ${f.numero} cargada.`);
      await refrescarCobranzas(qc);
      cerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo cargar la factura'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={cerrar}>
      <DialogHeader>
        <DialogTitle>Cargar factura</DialogTitle>
        <DialogDescription>La que ya emitiste con tu sistema de factura electrónica. Acá solo se registra para cobrarla.</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} className="space-y-4">
        <SelectorClienteOT clienteSeleccionado={cliente} onSeleccionar={setCliente} onDeseleccionar={() => setCliente(null)} error={errores.cliente} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="fNumero">Número de factura <span className="text-[#ea580c]">*</span></Label>
            <Input id="fNumero" value={numero} onChange={(e) => setNumero(e.target.value)} error={errores.numero} placeholder="001-001-0000123" />
          </div>
          <div>
            <Label htmlFor="fFecha">Fecha</Label>
            <Input id="fFecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} error={errores.fecha} />
          </div>
        </div>
        <div>
          <Label htmlFor="fMonto">Monto total (Gs.) <span className="text-[#ea580c]">*</span></Label>
          <Input id="fMonto" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} error={errores.monto} placeholder="321.499" />
        </div>
        <div>
          <Label htmlFor="fNota">Nota interna</Label>
          <Input id="fNota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Guardando…' : 'Cargar factura'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
