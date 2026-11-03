import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { ClienteFila } from '@afull/shared';
import { crearPresupuesto } from '../../lib/api-presupuestos.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { SelectorClienteOT } from '../forms/SelectorClienteOT.js';

type Props = { abierto: boolean; onCerrar: () => void; onCreado: (id: string) => void };

export function ModalNuevoPresupuesto({ abierto, onCerrar, onCreado }: Props) {
  const qc = useQueryClient();
  const [cliente, setCliente] = useState<ClienteFila | null>(null);
  const [titulo, setTitulo] = useState('');
  const [margen, setMargen] = useState('30');
  const [validez, setValidez] = useState('15');
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);

  const cerrar = () => {
    setCliente(null);
    setTitulo('');
    setMargen('30');
    setValidez('15');
    setNotas('');
    setErrores({});
    onCerrar();
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!cliente) err.cliente = 'Elegí un cliente';
    if (!titulo.trim()) err.titulo = 'El título es obligatorio';
    const m = Number(margen.replace(',', '.'));
    if (!Number.isFinite(m) || m < 0 || m >= 100) err.margen = 'Margen sobre la venta: de 0 a 99,99 %';
    const v = Number(validez);
    if (!Number.isInteger(v) || v < 1 || v > 365) err.validez = 'Entre 1 y 365 días';
    setErrores(err);
    if (Object.keys(err).length > 0 || !cliente) return;
    setCargando(true);
    try {
      const p = await crearPresupuesto({
        clienteId: cliente.id,
        titulo: titulo.trim(),
        margenPct: m,
        validezDias: v,
        notas: notas.trim() || undefined,
      });
      toast.success(`Presupuesto ${p.numero} creado en borrador.`);
      await qc.invalidateQueries({ queryKey: ['presupuestos'] });
      cerrar();
      onCreado(p.id);
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo crear el presupuesto'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={cerrar}>
      <DialogHeader>
        <DialogTitle>Nuevo Presupuesto</DialogTitle>
        <DialogDescription>Queda en borrador: después cargás los ítems y lo enviás.</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} className="space-y-4">
        <SelectorClienteOT
          clienteSeleccionado={cliente}
          onSeleccionar={setCliente}
          onDeseleccionar={() => setCliente(null)}
          error={errores.cliente}
        />
        <div>
          <Label htmlFor="pTitulo">Trabajo <span className="text-[#ea580c]">*</span></Label>
          <Input id="pTitulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} error={errores.titulo} placeholder="Ej: Cartelería fachada 3 locales" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="pMargen">Margen sobre venta %</Label>
            <Input id="pMargen" inputMode="decimal" value={margen} onChange={(e) => setMargen(e.target.value)} error={errores.margen} />
          </div>
          <div>
            <Label htmlFor="pValidez">Validez (días)</Label>
            <Input id="pValidez" inputMode="numeric" value={validez} onChange={(e) => setValidez(e.target.value)} error={errores.validez} />
          </div>
        </div>
        <div>
          <Label htmlFor="pNotas">Notas del cliente (medidas, pedido por WhatsApp, etc.)</Label>
          <textarea
            id="pNotas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-[#1f2937] bg-[#090a0f] p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Creando...' : 'Crear Presupuesto'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
