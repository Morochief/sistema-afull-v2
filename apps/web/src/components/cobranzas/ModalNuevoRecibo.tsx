import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_MEDIO, MEDIOS_PAGO, montoEnLetras, type MedioPago } from '@afull/shared';
import { crearRecibo, facturasConSaldo, hoyAsuncion, leerGs, refrescarCobranzas } from '../../lib/api-cobranzas.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearGs } from '../../lib/formato.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { SelectorClienteOT } from '../forms/SelectorClienteOT.js';
import { AplicacionesRecibo, type Marcas } from './AplicacionesRecibo.js';

type ClienteMin = { id: string; nombre: string };
type Props = { abierto: boolean; onCerrar: () => void; onCreado: (id: string) => void; clienteInicial?: ClienteMin | null; facturaInicial?: string };

/** Emitir un recibo de dinero: a qué facturas se aplica, cómo pagó y las retenciones. */
export function ModalNuevoRecibo({ abierto, onCerrar, onCreado, clienteInicial, facturaInicial }: Props) {
  const qc = useQueryClient();
  const [cliente, setCliente] = useState<ClienteMin | null>(null);
  const [marcas, setMarcas] = useState<Marcas>({});
  const [fecha, setFecha] = useState(hoyAsuncion);
  const [medio, setMedio] = useState<MedioPago>('TRANSFERENCIA');
  const [banco, setBanco] = useState('');
  const [referencia, setReferencia] = useState('');
  const [retencion, setRetencion] = useState('');
  const [retNumero, setRetNumero] = useState('');
  const [nota, setNota] = useState('');
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);

  useEffect(() => { if (abierto) setCliente(clienteInicial ?? null); }, [abierto, clienteInicial]);
  const facturas = useQuery({ queryKey: ['cobranzas', 'con-saldo', cliente?.id], queryFn: () => facturasConSaldo(cliente!.id), enabled: Boolean(cliente) });
  useEffect(() => {
    const f = facturas.data?.find((x) => x.id === facturaInicial);
    setMarcas(f ? { [f.id]: f.saldo_gs.toLocaleString('es-PY') } : {});
  }, [facturas.data, facturaInicial]);

  const montos = Object.entries(marcas).map(([facturaId, s]) => ({ facturaId, montoGs: leerGs(s) }));
  const bruto = montos.reduce((s, a) => s + (a.montoGs ?? 0), 0);
  const ret = retencion.trim() ? leerGs(retencion) : 0;
  const importe = bruto - (ret ?? 0);

  const cerrar = () => {
    setCliente(null); setMarcas({}); setFecha(hoyAsuncion()); setMedio('TRANSFERENCIA'); setBanco(''); setReferencia('');
    setRetencion(''); setRetNumero(''); setNota(''); setErrores({}); setClave(crypto.randomUUID());
    onCerrar();
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!cliente) err.cliente = 'Elegí un cliente';
    if (montos.length === 0) err.facturas = 'Tildá al menos una factura';
    const saldo = new Map(facturas.data?.map((f) => [f.id, f] as const));
    for (const a of montos) {
      const f = saldo.get(a.facturaId);
      if (!a.montoGs) err.facturas = 'Cada monto en guaraníes, sin decimales';
      else if (f && a.montoGs > f.saldo_gs) err.facturas = `A la ${f.numero} le quedan ${formatearGs(f.saldo_gs)}`;
    }
    if (ret === null) err.retencion = 'Monto en guaraníes';
    else if (!err.facturas && importe <= 0) err.retencion = 'La retención no puede ser igual o mayor a lo cobrado';
    setErrores(err);
    if (Object.keys(err).length > 0 || !cliente) return;
    setCargando(true);
    try {
      const r = await crearRecibo({
        clienteId: cliente.id, fecha, medio, banco: banco.trim() || undefined, referencia: referencia.trim() || undefined,
        retencionesGs: ret ?? 0, retencionNumero: retNumero.trim() || undefined, nota: nota.trim() || undefined,
        aplicaciones: montos.map((a) => ({ facturaId: a.facturaId, montoGs: a.montoGs! })), claveIdempotencia: clave,
      });
      toast.success(`Recibo ${r.numero} emitido.`);
      await refrescarCobranzas(qc);
      cerrar();
      onCreado(r.id);
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo emitir el recibo'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={cerrar}>
      <DialogHeader>
        <DialogTitle>Nuevo recibo de dinero</DialogTitle>
        <DialogDescription>Elegí qué facturas paga. El número del recibo sale solo.</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} className="space-y-3">
        <SelectorClienteOT clienteSeleccionado={cliente as never} onSeleccionar={(c) => { setCliente(c); setMarcas({}); }}
          onDeseleccionar={() => { setCliente(null); setMarcas({}); }} error={errores.cliente} />
        {cliente && (facturas.isLoading ? <p className="text-xs text-neutral-500">Cargando facturas…</p>
          : <AplicacionesRecibo facturas={facturas.data ?? []} marcas={marcas} onCambio={setMarcas} error={errores.facturas} />)}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rMedio">Medio de pago</Label>
            <select id="rMedio" value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)}
              className="h-9 w-full rounded-md border border-[#1f2937] bg-[#090a0f] px-2 text-sm text-neutral-100">
              {MEDIOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_MEDIO[m]}</option>)}
            </select>
          </div>
          <div><Label htmlFor="rFecha">Fecha</Label><Input id="rFecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div><Label htmlFor="rBanco">Banco</Label><Input id="rBanco" value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Opcional" /></div>
          <div><Label htmlFor="rRef">Nº de operación / cheque</Label><Input id="rRef" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Opcional" /></div>
          <div><Label htmlFor="rRet">Retenciones (Gs.)</Label><Input id="rRet" inputMode="numeric" value={retencion} onChange={(e) => setRetencion(e.target.value)} error={errores.retencion} placeholder="0" /></div>
          <div><Label htmlFor="rRetNro">Comprobante de retención</Label><Input id="rRetNro" value={retNumero} onChange={(e) => setRetNumero(e.target.value)} placeholder="Opcional" /></div>
        </div>
        <div><Label htmlFor="rNota">Nota interna (no sale en el recibo)</Label><Input id="rNota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" /></div>
        <div className="rounded border border-[#1f2937] bg-[#111318] p-3 text-sm" aria-live="polite">
          <div className="flex justify-between"><span className="text-neutral-400">Importe del recibo</span><span className="font-mono font-bold text-white">{formatearGs(Math.max(importe, 0))}</span></div>
          {importe > 0 && <div className="mt-1 text-xs italic text-neutral-400">{montoEnLetras(importe)}</div>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" disabled={cargando || !cliente}>{cargando ? 'Emitiendo…' : 'Emitir recibo'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
