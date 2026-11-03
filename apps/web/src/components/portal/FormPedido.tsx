import { useState } from 'react';
import { toast } from 'sonner';
import { portalNuevoPedido, type PortalYo } from '../../lib/api-portal.js';
import { mensajeDeError } from '../../lib/api.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

/** El cliente pide un trabajo para un local. La foto, por ahora, como enlace (Drive, Google Fotos, etc.). */
export function FormPedido({ token, yo, onEnviado }: { token: string; yo: PortalYo; onEnviado: () => void }) {
  const [sucursal, setSucursal] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState('');
  const [cargando, setCargando] = useState(false);
  // La clave se fija por intento: un doble toque o un reintento no duplica el pedido.
  const [clave, setClave] = useState(() => crypto.randomUUID());

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      const r = await portalNuevoPedido(token, { sucursalId: sucursal || undefined, descripcion: descripcion.trim(), fotoUrl: foto.trim() || undefined, claveIdempotencia: clave });
      toast.success(`Recibimos tu pedido ${r.numero}. Te vamos a contactar.`);
      setDescripcion('');
      setFoto('');
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
      <div>
        <Label htmlFor="pedidoFoto">Foto (enlace, opcional)</Label>
        <Input id="pedidoFoto" value={foto} onChange={(e) => setFoto(e.target.value)} placeholder="https://…" />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={cargando || descripcion.trim().length < 5}>{cargando ? 'Enviando…' : 'Enviar pedido'}</Button>
    </form>
  );
}
