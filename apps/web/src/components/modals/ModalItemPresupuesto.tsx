import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CONCEPTOS_ITEM_PRESUPUESTO, type ConceptoItemPresupuesto, type PresupuestoItemFila, type SucursalFila } from '@afull/shared';
import { agregarItemPresupuesto, editarItemPresupuesto } from '../../lib/api-presupuestos.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { CONCEPTO } from '../presupuestos/etiquetas.js';
import { numero } from '../../lib/numero.js';

type Props = {
  abierto: boolean;
  presupuestoId: string;
  item: PresupuestoItemFila | null; // null = alta
  sucursales: SucursalFila[];
  onCerrar: () => void;
  onGuardado: () => void;
};

const selectCls = 'h-9 w-full rounded-md border border-[#1f2937] bg-[#111318] px-2 text-sm text-neutral-100';
const aTexto = (n: number) => String(n).replace('.', ',');

export function ModalItemPresupuesto({ abierto, presupuestoId, item, sucursales, onCerrar, onGuardado }: Props) {
  const [concepto, setConcepto] = useState<ConceptoItemPresupuesto>('MATERIAL');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [unidad, setUnidad] = useState('UNIDAD');
  const [precio, setPrecio] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setConcepto(item?.concepto ?? 'MATERIAL');
    setDescripcion(item?.descripcion ?? '');
    setCantidad(item ? aTexto(item.cantidad) : '1');
    setUnidad(item?.unidad ?? 'UNIDAD');
    setPrecio(item ? aTexto(item.precio_unitario_gs) : '');
    setSucursalId(item?.sucursal_id ?? '');
    setErrores({});
  }, [abierto, item]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = numero(cantidad);
    const p = numero(precio);
    const err: Record<string, string> = {};
    if (!descripcion.trim()) err.descripcion = 'Obligatoria';
    if (!(c > 0)) err.cantidad = 'Número mayor a 0, hasta 4 decimales';
    if (!(p >= 0)) err.precio = 'Número, hasta 4 decimales';
    setErrores(err);
    if (Object.keys(err).length) return;
    const datos = { concepto, descripcion: descripcion.trim(), cantidad: c, unidad: unidad.trim() || 'UNIDAD', precioUnitarioGs: p, sucursalId: sucursalId || null };
    setCargando(true);
    try {
      if (item) await editarItemPresupuesto(presupuestoId, item.id, datos);
      else await agregarItemPresupuesto(presupuestoId, datos);
      onGuardado();
      onCerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo guardar el ítem'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>{item ? 'Editar Ítem' : 'Agregar Ítem'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="iConcepto">Concepto</Label>
            <select id="iConcepto" className={selectCls} value={concepto} onChange={(e) => setConcepto(e.target.value as ConceptoItemPresupuesto)}>
              {CONCEPTOS_ITEM_PRESUPUESTO.map((k) => <option key={k} value={k}>{CONCEPTO[k]}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="iSucursal">Sucursal (opcional)</Label>
            <select id="iSucursal" className={selectCls} value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Sin sucursal</option>
              {sucursales.filter((s) => s.activo || s.id === sucursalId).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="iDescripcion">Descripción</Label>
          <Input id="iDescripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} error={errores.descripcion} placeholder="Ej: Lona front 3×1 m con ojales" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="iCantidad">Cantidad</Label>
            <Input id="iCantidad" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} error={errores.cantidad} />
          </div>
          <div>
            <Label htmlFor="iUnidad">Unidad</Label>
            <Input id="iUnidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} maxLength={20} />
          </div>
          <div>
            <Label htmlFor="iPrecio">Precio unit. (Gs.)</Label>
            <Input id="iPrecio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} error={errores.precio} />
          </div>
        </div>
        <p className="text-[11px] text-neutral-500">Para varios locales, cargá cada ítem con su sucursal: al aprobar se genera una OT por local.</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Guardando...' : 'Guardar Ítem'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
