import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { OrigenDiseno } from '@afull/shared';
import { subirDiseno } from '../../lib/api-disenos.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

type Props = { otId: string | null; puedeElegirOrigen: boolean; onCerrar: () => void; reemplaza?: boolean };

/**
 * Cargar el enlace de Drive del diseño. Comercial elige si es del cliente o de la diseñadora; Nachi sube como diseñadora.
 * Loop 19: Nachi puede tildar "Ya lo verifiqué" (Edu lo ve enseguida) y, si reemplaza una versión, dice qué cambió.
 */
export function ModalSubirDiseno({ otId, puedeElegirOrigen, onCerrar, reemplaza = false }: Props) {
  const disenadora = !puedeElegirOrigen;
  const [verificada, setVerificada] = useState(false);
  const [motivo, setMotivo] = useState('');
  const qc = useQueryClient();
  const [origen, setOrigen] = useState<OrigenDiseno>(puedeElegirOrigen ? 'CLIENTE' : 'DISENADORA');
  const [url, setUrl] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  if (!otId) return null;

  const cerrar = () => {
    setUrl('');
    setNotas('');
    setError(null);
    onCerrar();
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url.trim())) {
      setError('Pegá el enlace de Google Drive del archivo original');
      return;
    }
    setCargando(true);
    try {
      const datos = { origen, driveUrl: url.trim(), notas: notas.trim() || undefined };
      const r = await subirDiseno(otId, disenadora ? { ...datos, verificada, motivoCambio: motivo.trim() || undefined } : datos);
      toast.success(verificada ? `Diseño v${r.version} verificado: Edu ya lo ve en Diseños.` : `Diseño v${r.version} cargado: queda por verificar.`);
      void qc.invalidateQueries({ queryKey: ['disenos'] });
      cerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo cargar el diseño'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto onCerrar={cerrar}>
      <DialogHeader>
        <DialogTitle>Cargar diseño</DialogTitle>
        <DialogDescription>Edu lo ve recién cuando esté verificado (medidas, textos y colores).</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} className="space-y-4">
        {puedeElegirOrigen && (
          <div className="flex gap-2 text-xs">
            {(['CLIENTE', 'DISENADORA'] as const).map((o) => (
              <Button key={o} type="button" size="sm" variant={origen === o ? undefined : 'outline'} onClick={() => setOrigen(o)}>
                {o === 'CLIENTE' ? 'Lo trajo el cliente' : 'Lo hizo la diseñadora'}
              </Button>
            ))}
          </div>
        )}
        <div>
          <Label htmlFor="disenoUrl">Enlace de Google Drive del original <span className="text-[#ea580c]">*</span></Label>
          <Input id="disenoUrl" value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} error={error ?? undefined} placeholder="https://drive.google.com/file/d/…" autoFocus />
        </div>
        <div>
          <Label htmlFor="disenoNotas">Notas (medidas, material, qué cambió)</Label>
          <Input id="disenoNotas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} />
        </div>
        {disenadora && reemplaza && (
          <div>
            <Label htmlFor="disenoMotivo">Qué cambió (por qué la reemplazás)</Label>
            <Input id="disenoMotivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ej. Edu vio un error en el teléfono" />
          </div>
        )}
        {disenadora && (
          <label className="flex items-start gap-2 rounded border border-[#1f2937] p-2 text-xs text-neutral-200">
            <input type="checkbox" checked={verificada} onChange={(e) => setVerificada(e.target.checked)} className="mt-0.5" />
            <span>Ya lo verifiqué (medidas, textos y colores): Edu lo ve enseguida.</span>
          </label>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Cargando...' : 'Cargar diseño'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
