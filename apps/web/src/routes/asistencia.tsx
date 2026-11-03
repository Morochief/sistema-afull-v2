import { useListadoUrl } from '../hooks/useListadoUrl.js';
import { listarAsistencia, type Marcacion } from '../lib/api-permisos.js';
import { TablaAdmin } from '../components/tabla/TablaAdmin.js';
import type { Columna } from '../components/tabla/tipos.js';
import { Badge } from '../components/ui/badge.js';
import { formatearFechaHora } from '../lib/fechas.js';

const metros = (m: number | null) => (m === null ? '—' : m >= 1000 ? `${(m / 1000).toLocaleString('es-PY', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);

/**
 * Asistencia (RR.HH.): marcaciones de entrada y salida. La geocerca es disuasiva: "fuera" no es una falta,
 * es un dato para mirar (el GPS del celular puede fallar o ser falseado).
 */
export function AsistenciaPage() {
  const { datos, estado, filtros, setFiltros, reintentar } = useListadoUrl<Marcacion>('/asistencia', 'asistencia', listarAsistencia);
  const columnas: Columna<Marcacion>[] = [
    {
      id: 'cuando', encabezado: 'Cuándo', ancho: 'w-44',
      celda: (f) => (
        <div>
          <span className="font-mono text-xs text-neutral-300">{formatearFechaHora(f.marcada_at)}</span>
          {/* Cargada sin señal: la hora es la del celular (se acota en la API, pero es falsificable). */}
          {f.sin_senal && <div className="text-[10px] text-amber-400" title={`Llegó ${formatearFechaHora(f.recibida_at)}`}>sin señal · llegó {formatearFechaHora(f.recibida_at)}</div>}
        </div>
      ),
    },
    { id: 'persona', encabezado: 'Persona', celda: (f) => <span className="text-white">{f.persona_nombre}</span> },
    { id: 'tipo', encabezado: 'Marcó', ancho: 'w-24', celda: (f) => <span className="text-xs text-neutral-300">{f.tipo === 'ENTRADA' ? 'Entrada' : f.tipo === 'SALIDA' ? 'Salida' : f.tipo}</span> },
    {
      id: 'lugar', encabezado: 'Dónde', ancho: 'w-56',
      celda: (f) => (
        <div className="flex items-center gap-2">
          <Badge variant={f.dentro_geocerca ? 'success' : 'warning'}>{f.dentro_geocerca ? 'En sede' : 'Fuera'}</Badge>
          <span className="text-[11px] text-neutral-400">{f.sede_nombre ?? 'sin sede'} · {metros(f.distancia_m)}{f.precision_m ? ` (±${Math.round(f.precision_m)} m)` : ''}</span>
        </div>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Asistencia</h1>
        <p className="text-xs text-neutral-400">Marcaciones del personal. "Fuera" es un aviso, no una falta: el GPS del celular puede fallar.</p>
      </div>
      <TablaAdmin
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={[{ valor: 'todos', etiqueta: 'Todas' }, { valor: 'FUERA', etiqueta: 'Fuera de la sede' }]}
        claveFila={(f) => f.id}
        textoBusqueda="Buscar por persona..."
        vacio={{ titulo: 'Sin marcaciones', descripcion: 'No hay marcaciones con los filtros actuales.' }}
        onReintentar={reintentar}
      />
    </div>
  );
}
