import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { guardarEmpresa, obtenerEmpresa } from '../../lib/api-cobranzas.js';
import { mensajeDeError } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { PestanasCobranzas } from '../../components/cobranzas/PestanasCobranzas.js';

const CAMPOS = [
  ['razonSocial', 'razon_social', 'Razón social *'], ['ruc', 'ruc', 'RUC *'], ['direccion', 'direccion', 'Dirección'],
  ['ciudad', 'ciudad', 'Ciudad (sale en "Lugar y Fecha")'], ['telefono', 'telefono', 'Teléfono'], ['email', 'email', 'Correo'],
] as const;
type Forma = Record<(typeof CAMPOS)[number][0], string>;

/** Loop 21: datos de aFull para el encabezado del recibo (solo admin). */
export function CobranzasEmpresaPage() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['cobranzas-empresa'], queryFn: obtenerEmpresa });
  const [f, setF] = useState<Forma>({ razonSocial: '', ruc: '', direccion: '', ciudad: '', telefono: '', email: '' });
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (data) setF(Object.fromEntries(CAMPOS.map(([k, col]) => [k, data[col] ?? ''])) as Forma);
  }, [data]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      await guardarEmpresa({ ...f, direccion: f.direccion || undefined, ciudad: f.ciudad || undefined, telefono: f.telefono || undefined, email: f.email || undefined });
      toast.success('Datos guardados. Ya salen en los recibos.');
      await refetch();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudieron guardar los datos'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="space-y-4">
      <PestanasCobranzas actual="empresa" />
      {isLoading ? <p className="text-sm text-neutral-500">Cargando…</p> : (
        <form onSubmit={enviar} className="grid max-w-2xl grid-cols-2 gap-3 rounded-md border border-[#1f2937] bg-[#111318] p-4">
          {CAMPOS.map(([k, , etiqueta]) => (
            <div key={k}>
              <Label htmlFor={`emp-${k}`}>{etiqueta}</Label>
              <Input id={`emp-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
          <div className="col-span-2 flex justify-end"><Button type="submit" disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar'}</Button></div>
        </form>
      )}
    </div>
  );
}
