import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  obtenerTarifasPersona,
  crearTarifaPersona,
  cerrarTarifa,
} from '../../lib/api-personas.js';
import { formatearGs } from '../../lib/formato.js';
import { mensajeDeError } from '../../lib/api.js';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { Plus, X } from 'lucide-react';
import type { PersonaFila, TarifaFila } from '@afull/shared';

type Props = {
  persona: PersonaFila | null;
  onCerrar: () => void;
};

export function ModalTarifasPersona({ persona, onCerrar }: Props) {
  const [tarifas, setTarifas] = useState<TarifaFila[]>([]);
  const [cargando, setCargando] = useState(false);

  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [nuevaTarifaGs, setNuevaTarifaGs] = useState('');
  const [nuevaFechaInicio, setNuevaFechaInicio] = useState('');
  const [nuevaFechaFin, setNuevaFechaFin] = useState('');
  const [tarifaCerrarId, setTarifaCerrarId] = useState<string | null>(null);
  const [fechaCierre, setFechaCierre] = useState('');

  const cargarTarifas = useCallback(() => {
    if (!persona) return;
    setCargando(true);
    obtenerTarifasPersona(persona.id)
      .then(setTarifas)
      .catch((err) => toast.error(mensajeDeError(err, 'Error al cargar tarifas')))
      .finally(() => setCargando(false));
  }, [persona]);

  useEffect(() => {
    cargarTarifas();
    setMostrarNueva(false);
    setTarifaCerrarId(null);
  }, [cargarTarifas]);

  if (!persona) return null;

  const handleCrearTarifa = async (e: React.FormEvent) => {
    e.preventDefault();
    const gs = Number(nuevaTarifaGs);
    if (!gs || gs <= 0 || !nuevaFechaInicio) {
      toast.error('Complete la tarifa por hora y la fecha de inicio.');
      return;
    }
    setCargando(true);
    try {
      await crearTarifaPersona(persona.id, {
        tarifaHoraGs: gs,
        fechaInicio: nuevaFechaInicio,
        fechaFin: nuevaFechaFin || undefined,
      });
      toast.success('Nueva tarifa registrada.');
      setMostrarNueva(false);
      setNuevaTarifaGs('');
      setNuevaFechaInicio('');
      setNuevaFechaFin('');
      cargarTarifas();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al registrar tarifa'));
    } finally {
      setCargando(false);
    }
  };

  const handleCerrarTarifa = async (tarifaId: string) => {
    if (!fechaCierre) {
      toast.error('Indique la fecha de fin de vigencia.');
      return;
    }
    setCargando(true);
    try {
      await cerrarTarifa(tarifaId, { fechaFin: fechaCierre });
      toast.success('Tarifa cerrada.');
      setTarifaCerrarId(null);
      setFechaCierre('');
      cargarTarifas();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al cerrar tarifa'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={Boolean(persona)} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Historial de Tarifas Horarias (RRHH)</DialogTitle>
        <DialogDescription>
          Tarifas de mano de obra para {persona.nombre}. No se permiten vigencias solapadas.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#1f2937] pb-2">
          <span className="text-xs text-neutral-400 font-semibold uppercase">
            Vigencias Registradas
          </span>
          {!mostrarNueva && (
            <Button
              size="sm"
              onClick={() => setMostrarNueva(true)}
              className="h-7 text-xs gap-1"
            >
              <Plus className="h-3 w-3" /> Nueva Tarifa
            </Button>
          )}
        </div>

        {mostrarNueva && (
          <form onSubmit={handleCrearTarifa} className="p-3 rounded border border-[#ea580c]/50 bg-[#161922] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Registrar Nueva Tarifa</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMostrarNueva(false)} className="h-6 w-6 p-0">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="gs">Gs / Hora *</Label>
                <Input
                  id="gs"
                  type="number"
                  min={1}
                  value={nuevaTarifaGs}
                  onChange={(e) => setNuevaTarifaGs(e.target.value)}
                  placeholder="Ej: 45000"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="fInicio">Inicio *</Label>
                <Input
                  id="fInicio"
                  type="date"
                  value={nuevaFechaInicio}
                  onChange={(e) => setNuevaFechaInicio(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="fFin">Fin (opc.)</Label>
                <Input
                  id="fFin"
                  type="date"
                  value={nuevaFechaFin}
                  onChange={(e) => setNuevaFechaFin(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={cargando} className="w-full h-8 text-xs">
              {cargando ? 'Guardando...' : 'Guardar Tarifa'}
            </Button>
          </form>
        )}

        {tarifas.length === 0 ? (
          <p className="text-xs text-neutral-500 py-3 text-center">
            No hay tarifas registradas para esta persona.
          </p>
        ) : (
          <div className="divide-y divide-[#1f2937] max-h-48 overflow-y-auto pr-1">
            {tarifas.map((t) => (
              <div key={t.id} className="py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white text-sm">
                    {formatearGs(Number(t.tarifa_hora_gs))} / h
                  </span>
                  <p className="text-[11px] text-neutral-400">
                    Desde {t.fecha_inicio} {t.fecha_fin ? `hasta ${t.fecha_fin}` : '(Vigente)'}
                  </p>
                </div>
                {!t.fecha_fin && (
                  <div>
                    {tarifaCerrarId === t.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="date"
                          value={fechaCierre}
                          onChange={(e) => setFechaCierre(e.target.value)}
                          className="h-7 w-32 text-[11px]"
                        />
                        <Button
                          size="sm"
                          onClick={() => void handleCerrarTarifa(t.id)}
                          className="h-7 text-xs px-2"
                        >
                          OK
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTarifaCerrarId(null)}
                          className="h-7 px-1 text-neutral-400"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTarifaCerrarId(t.id);
                          setFechaCierre('');
                        }}
                        className="h-6 text-[11px] border-[#1f2937]"
                      >
                        Cerrar Vigencia
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
      </DialogFooter>
    </Dialog>
  );
}
