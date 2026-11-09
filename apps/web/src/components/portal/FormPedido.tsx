import { useState } from 'react';
import { toast } from 'sonner';
import { MAX_POR_REFERENCIA } from '@afull/shared';
import { portalNuevoPedido, type PortalYo } from '../../lib/api-portal.js';
import { BASE_PORTAL, llamadorPortal, subirArchivo } from '../../lib/api-archivos.js';
import { mensajeDeError } from '../../lib/api.js';
import { Button } from '../ui/button.js';
import { Label } from '../ui/label.js';
import { BotonFoto } from '../archivos/BotonFoto.js';

type Foto = { blob: Blob; mime: string; clave: string; vista: string };
const MAX_FOTOS = MAX_POR_REFERENCIA.FOTO_PEDIDO;

/** El cliente pide un trabajo para un local, con hasta 3 fotos (se achican en el celular antes de subir). */
export function FormPedido({ token, yo, onEnviado }: { token: string; yo: PortalYo; onEnviado: () => void }) {
  const [sucursal, setSucursal] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [cargando, setCargando] = useState(false);
  // La clave se fija por intento: un doble toque o un reintento no duplica el pedido (ni sus fotos).
  const [clave, setClave] = useState(() => crypto.randomUUID());

  const agregar = (a: { blob: Blob; mime: string }) =>
    setFotos((fs) => [...fs, { ...a, clave: crypto.randomUUID(), vista: URL.createObjectURL(a.blob) }].slice(0, MAX_FOTOS));
  const quitar = (c: string) => setFotos((fs) => fs.filter((f) => f.clave !== c));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      const r = await portalNuevoPedido(token, { sucursalId: sucursal || undefined, descripcion: descripcion.trim(), claveIdempotencia: clave });
      let fallidas = 0;
      for (const f of fotos) {
        try {
          await subirArchivo(llamadorPortal(token), BASE_PORTAL, { tipo: 'FOTO_PEDIDO', pedidoId: r.id, mime: f.mime, blob: f.blob, claveIdempotencia: f.clave });
        } catch {
          fallidas++;
        }
      }
      if (fallidas) toast.warning(`Recibimos tu pedido ${r.numero}, pero ${fallidas === 1 ? 'una foto no se pudo subir' : `${fallidas} fotos no se pudieron subir`}. Podés agregarlas desde "Mis pedidos".`);
      else toast.success(`Recibimos tu pedido ${r.numero}. Te vamos a contactar.`);
      fotos.forEach((f) => URL.revokeObjectURL(f.vista));
      setDescripcion('');
      setFotos([]);
      setClave(crypto.randomUUID());
      onEnviado();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo enviar el pedido'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-sm">
      <h2 className="font-semibold text-white">Nuevo pedido</h2>
      {yo.sucursales.length > 0 && (
        <div>
          <Label htmlFor="pedidoLocal">Local</Label>
          <select id="pedidoLocal" className="h-10 w-full rounded-md border border-[#1f2937] bg-[#090a0f] px-2 text-neutral-100" value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            <option value="">Sin local específico</option>
            {yo.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      )}
      <div>
        <Label htmlFor="pedidoDescripcion">¿Qué necesitás?</Label>
        <textarea id="pedidoDescripcion" className="min-h-[90px] w-full rounded-md border border-[#1f2937] bg-[#090a0f] p-2 text-neutral-100" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} placeholder="Ej.: cambiar la lona del frente, medidas aproximadas 3 × 1 m" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-300">Fotos del lugar (opcional, hasta {MAX_FOTOS})</span>
          <BotonFoto etiqueta="Agregar foto" onArchivo={agregar} disabled={fotos.length >= MAX_FOTOS || cargando} />
        </div>
        {fotos.length > 0 && (
          <div className="flex gap-2" data-testid="fotos-pedido">
            {fotos.map((f) => (
              <button key={f.clave} type="button" onClick={() => quitar(f.clave)} title="Quitar" className="relative">
                <img src={f.vista} alt="Foto del pedido" className="h-16 w-16 rounded border border-[#1f2937] object-cover" />
                <span className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] text-white">✕</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Button type="submit" className="h-11 w-full" disabled={cargando || descripcion.trim().length < 5}>{cargando ? 'Enviando…' : 'Enviar pedido'}</Button>
    </form>
  );
}
