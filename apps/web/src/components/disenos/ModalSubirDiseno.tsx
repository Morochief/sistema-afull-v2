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

type Props = { otId: string | null; puedeElegirOrigen: boolean; onCerrar: () => void };

/** Cargar el enlace de Drive del diseño. Comercial elige si es del cliente o de la diseñadora; Nachi sube como diseñadora. */
export function ModalSubirDiseno({ otId, puedeElegirOrigen, onCerrar }: Props) {
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
      const r = await subirDiseno(otId, { origen, driveUrl: url.trim(), notas: notas.trim() || undefined });
      toast.success(`Diseño v${r.version} cargado: queda esperando la verificación de Juan o Sofi.`);
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
        <DialogDescription>Edu lo ve recién cuando Juan o Sofi verifiquen medidas y demás.</DialogDescription>
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Cargando...' : 'Cargar diseño'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
