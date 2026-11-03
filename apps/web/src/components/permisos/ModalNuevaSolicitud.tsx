import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { CODIGOS_TIPO_PERMISO, TIPOS_PERMISO, type TipoPermiso } from '@afull/shared';
import { crearPermiso } from '../../lib/api-permisos.js';
import { obtenerPersonas } from '../../lib/api-personas.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

const sel = 'h-9 w-full rounded-md border border-[#1f2937] bg-[#111318] px-2 text-sm text-neutral-100';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());

type Props = { abierto: boolean; esRrhh: boolean; onCerrar: () => void; onCreada: (id: string) => void };

/** Formulario de solicitud de permiso (como el de papel). RR.HH. puede cargarlo a nombre de otra persona. */
export function ModalNuevaSolicitud({ abierto, esRrhh, onCerrar, onCreada }: Props) {
  const [personaId, setPersonaId] = useState('');
  const [tipo, setTipo] = useState<TipoPermiso>('RETIRO_ANTICIPADO');
  const [detalle, setDetalle] = useState('');
  const [motivo, setMotivo] = useState('');
  const [modalidad, setModalidad] = useState<'HORAS' | 'DIAS'>('HORAS');
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [cargando, setCargando] = useState(false);
  const personas = useQuery({ queryKey: ['personas', 'permiso'], queryFn: () => obtenerPersonas({ pagina: 1, activo: 'true' }), enabled: abierto && esRrhh });
  if (!abierto) return null;
  const pideComprobante = TIPOS_PERMISO[tipo].requiereComprobante;
  const aclarar = tipo === 'OTRO' || tipo === 'SALUD';

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      const r = await crearPermiso({
        personaId: personaId || undefined, tipo, detalleTipo: aclarar ? detalle.trim() : undefined, motivo: motivo.trim(), modalidad,
        fechaDesde: desde, fechaHasta: modalidad === 'DIAS' ? hasta : undefined,
        horaDesde: modalidad === 'HORAS' ? horaDesde : undefined, horaHasta: modalidad === 'HORAS' ? horaHasta : undefined,
        comprobanteUrl: comprobante.trim() || undefined, claveIdempotencia: crypto.randomUUID(),
      });
      toast.success(`Solicitud ${r.numero} enviada.${r.fuera_de_plazo ? ' Quedó marcada como presentada fuera de las 24 h.' : ''}`);
      onCreada(r.id);
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo enviar la solicitud'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Solicitud de permiso</DialogTitle>
        <DialogDescription>Presentala dentro de las 24 h. Siempre explicá el motivo; si es por salud, adjuntá el reposo o certificado.</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} className="space-y-3 text-xs">
        {esRrhh && (
          <div>
            <Label htmlFor="permisoPersona">A nombre de</Label>
            <select id="permisoPersona" className={sel} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              <option value="">Yo mismo/a</option>
              {(personas.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        )}
        <div>
          <Label htmlFor="permisoTipo">Solicito</Label>
          <select id="permisoTipo" className={sel} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPermiso)}>
            {CODIGOS_TIPO_PERMISO.map((t) => <option key={t} value={t}>{TIPOS_PERMISO[t].texto}</option>)}
          </select>
        </div>
        {aclarar && <Input aria-label="Aclaración" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Aclarar (obligatorio)" maxLength={200} />}
        <div>
          <Label htmlFor="permisoMotivo">Motivo</Label>
          <textarea id="permisoMotivo" className="min-h-[60px] w-full rounded-md border border-[#1f2937] bg-[#111318] p-2 text-sm text-neutral-100" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} />
        </div>
        <div className="flex gap-4">
          {(['HORAS', 'DIAS'] as const).map((m) => (
            <label key={m} className="flex items-center gap-1 text-neutral-300">
              <input type="radio" name="modalidad" checked={modalidad === m} onChange={() => setModalidad(m)} /> {m === 'HORAS' ? 'Por horas' : 'Por días'}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="permisoDesde">{modalidad === 'HORAS' ? 'Día' : 'Desde el día'}</Label><Input id="permisoDesde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          {modalidad === 'DIAS' ? (
            <div><Label htmlFor="permisoHasta">Hasta el día</Label><Input id="permisoHasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              <div><Label htmlFor="permisoHoraDesde">Desde</Label><Input id="permisoHoraDesde" type="time" value={horaDesde} onChange={(e) => setHoraDesde(e.target.value)} /></div>
              <div><Label htmlFor="permisoHoraHasta">Hasta</Label><Input id="permisoHoraHasta" type="time" value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)} /></div>
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="permisoComprobante">Comprobante (enlace, opcional){pideComprobante && <span className="text-amber-400"> · este tipo lo requiere</span>}</Label>
          <Input id="permisoComprobante" value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="https://drive.google.com/…" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Cancelar</Button>
          <Button type="submit" disabled={cargando || motivo.trim().length < 5}>{cargando ? 'Enviando…' : 'Enviar solicitud'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
