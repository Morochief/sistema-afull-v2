import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2 } from 'lucide-react';
import { accesosDeCliente, crearAccesoPortal, revocarAccesoPortal, enlacePortal } from '../../lib/api-portal.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearDia, formatearFechaHora } from '../../lib/fechas.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Badge } from '../ui/badge.js';

/** Enlaces del portal de un cliente: se generan, se copian UNA vez y se revocan. */
export function SeccionPortalCliente({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['portal-accesos', clienteId], queryFn: () => accesosDeCliente(clienteId) });
  const [para, setPara] = useState('');
  const [nuevo, setNuevo] = useState<string | null>(null);
  const refrescar = () => void qc.invalidateQueries({ queryKey: ['portal-accesos', clienteId] });

  const generar = async () => {
    try {
      const r = await crearAccesoPortal({ clienteId, descripcion: para.trim() });
      setNuevo(enlacePortal(r.token));
      setPara('');
      refrescar();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo generar el enlace'));
    }
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(nuevo!);
      toast.success('Enlace copiado: mandáselo al cliente.');
    } catch {
      toast.error('No se pudo copiar: seleccioná el texto y copialo a mano.');
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs" data-testid="seccion-portal">
      <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-neutral-400"><Link2 className="h-3.5 w-3.5" /> Portal del cliente</h2>
      <div className="flex gap-2">
        <Input aria-label="Enlace para" value={para} onChange={(e) => setPara(e.target.value)} placeholder="Para quién (ej.: Compras, María)" className="max-w-xs" />
        <Button size="sm" disabled={para.trim().length < 2} onClick={() => void generar()}>Generar enlace</Button>
      </div>
      {nuevo && (
        <div className="space-y-1 rounded border border-amber-500/30 bg-amber-500/5 p-2">
          <p className="text-amber-300">Copialo ahora: por seguridad no se vuelve a mostrar. Vence en 180 días.</p>
          <div className="flex gap-2">
            <Input readOnly value={nuevo} aria-label="Enlace generado" className="font-mono text-[11px]" onFocus={(e) => e.target.select()} />
            <Button size="sm" variant="outline" className="gap-1" onClick={() => void copiar()}><Copy className="h-3.5 w-3.5" /> Copiar</Button>
          </div>
        </div>
      )}
      {data.map((a) => (
        <div key={a.id} className="flex items-center justify-between border-t border-[#1f2937] pt-2">
          <span className={a.vigente ? 'text-white' : 'text-neutral-500'}>
            {a.descripcion} <span className="text-neutral-500">· vence {formatearDia(a.expira_at)}{a.ultimo_uso_at ? ` · usado ${formatearFechaHora(a.ultimo_uso_at)}` : ' · sin uso'}</span>
          </span>
          {a.vigente ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void revocarAccesoPortal(a.id).then(() => { toast.success('Enlace revocado.'); refrescar(); }, (e) => toast.error(mensajeDeError(e)))}>Revocar</Button>
          ) : <Badge variant="neutral">{a.activo ? 'Vencido' : 'Revocado'}</Badge>}
        </div>
      ))}
    </section>
  );
}
