import { Link } from '@tanstack/react-router';
import { useInicio } from '../hooks/useInicio.js';
import { Indicador, Bloque } from '../components/inicio/Tarjeta.js';
import { formatearGs } from '../lib/formato.js';
import { mensajeDeError } from '../lib/api.js';

const ESTADOS: [string, string][] = [
  ['PENDIENTE', 'Pendientes'], ['EN_DISENO', 'En diseño'], ['EN_TALLER', 'En taller'], ['EN_MONTAJE', 'En montaje'], ['TERMINADO', 'Terminadas (mes)'],
];
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
const fecha = (d: string) => d.split('-').reverse().join('/');
const margen = (v: number, c: number) => (v > 0 ? `${(((v - c) / v) * 100).toFixed(1).replace('.', ',')} %` : '—');

/** Inicio de la oficina: qué está pasando hoy y qué espera una decisión. */
export function InicioPage() {
  const { data: t, isLoading, error } = useInicio();
  if (isLoading) return <p className="text-xs text-neutral-400">Cargando el tablero…</p>;
  if (error || !t) return <p className="text-xs text-red-400">{mensajeDeError(error, 'No se pudo cargar el tablero')}</p>;

  return (
    <div className="space-y-4" data-testid="tablero-inicio">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Inicio</h1>
        <p className="text-xs text-neutral-400">Lo que está pasando hoy. Se actualiza solo cada 30 segundos.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ESTADOS.map(([e, et]) => (
          <Indicador key={e} titulo={et} valor={t.ots_por_estado[e] ?? 0} a={`/ots?estado=${e}`} tono={e === 'TERMINADO' ? 'ok' : 'normal'} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador titulo="Pedidos nuevos" valor={t.pedidos_nuevos_total} a="/pedidos?estado=NUEVO" tono={t.pedidos_nuevos_total ? 'alerta' : 'normal'} detalle="del portal de clientes" />
        <Indicador titulo="Diseños por verificar" valor={t.disenos_por_verificar} a="/disenos" tono={t.disenos_por_verificar ? 'alerta' : 'normal'} />
        <Indicador titulo="Presupuestos enviados" valor={t.presupuestos_enviados.n} a="/presupuestos?estado=ENVIADO" detalle={`${formatearGs(t.presupuestos_enviados.monto_gs)} sin IVA, esperando respuesta`} />
        <Indicador titulo="Permisos pendientes" valor={t.permisos_pendientes} a="/permisos?estado=PENDIENTE" tono={t.permisos_pendientes ? 'alerta' : 'normal'} />
      </div>

      {t.mes && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Indicador titulo="Vendido (OTs cerradas del mes)" valor={formatearGs(t.mes.vendido_gs)} a="/rentabilidad" detalle={`${t.mes.ots} OT(s) con presupuesto`} />
          <Indicador titulo="Costo real" valor={formatearGs(t.mes.costo_gs)} a="/rentabilidad" />
          <Indicador titulo="Margen del mes" valor={margen(t.mes.vendido_gs, t.mes.costo_gs)} a="/rentabilidad" tono="ok" />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloque titulo={`Trabajando ahora (${t.trabajando_ahora.length})`} hayDatos={t.trabajando_ahora.length > 0} vacio="Nadie tiene el cronómetro en marcha." accion={<Link to="/en-vivo" className="text-[11px] text-[#ea580c] hover:underline">En vivo →</Link>}>
          {t.trabajando_ahora.map((w) => (
            <Link key={w.persona + w.ot_id} to="/ots/$id" params={{ id: w.ot_id }} className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-white/5">
              <span><span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> <b className="text-white">{w.persona}</b> · {w.descripcion}</span>
              <span className="shrink-0 text-neutral-400">{w.codigo_ot} · desde {hora(w.hora_inicio)}</span>
            </Link>
          ))}
        </Bloque>

        <Bloque titulo={`Salidas de hoy (${t.hojas_hoy.length})`} hayDatos={t.hojas_hoy.length > 0} vacio="No hay hojas de ruta para hoy." accion={<Link to="/hojas-ruta" className="text-[11px] text-[#ea580c] hover:underline">Hojas de ruta →</Link>}>
          {t.hojas_hoy.map((h) => (
            <Link key={h.id} to="/hojas-ruta/$id" params={{ id: h.id }} className="block px-3 py-2 text-xs hover:bg-white/5">
              <div className="flex justify-between gap-2"><b className="text-white">{h.descripcion ?? 'Hoja de ruta'}</b><span className="text-neutral-400">{h.resueltas}/{h.paradas} paradas</span></div>
              <div className="text-neutral-400">{h.chapa ?? 'Sin vehículo'} · {h.cuadrilla ?? 'Sin cuadrilla'}</div>
            </Link>
          ))}
        </Bloque>

        <Bloque titulo={`OTs atrasadas (${t.atrasadas_total})`} hayDatos={t.atrasadas.length > 0} vacio="Ninguna OT pasó su fecha prometida.">
          {t.atrasadas.map((o) => (
            <Link key={o.id} to="/ots/$id" params={{ id: o.id }} className="flex justify-between gap-2 px-3 py-2 text-xs hover:bg-white/5">
              <span><b className="text-white">{o.codigo_ot}</b> · {o.titulo} <span className="text-neutral-500">({o.cliente})</span></span>
              <span className="shrink-0 text-amber-400">prometida {fecha(o.fecha_prometida)}</span>
            </Link>
          ))}
        </Bloque>

        <Bloque titulo={`Pedidos nuevos del portal (${t.pedidos_nuevos_total})`} hayDatos={t.pedidos_nuevos.length > 0} vacio="No hay pedidos sin atender." accion={<Link to="/pedidos" className="text-[11px] text-[#ea580c] hover:underline">Pedidos →</Link>}>
          {t.pedidos_nuevos.map((p) => (
            <Link key={p.id} to="/pedidos" className="block px-3 py-2 text-xs hover:bg-white/5">
              <div><b className="text-white">{p.numero}</b> · {p.cliente}</div>
              <div className="line-clamp-1 text-neutral-400">{p.descripcion}</div>
            </Link>
          ))}
        </Bloque>
      </div>
    </div>
  );
}
