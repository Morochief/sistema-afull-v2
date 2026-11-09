import crypto from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { extensionDe, maxBytesDe, MAX_POR_REFERENCIA, type FiltroArchivos, type SolicitarArchivo } from '@afull/shared';
import { sql } from '../../db/client.js';
import { almacenamiento } from '../../lib/almacenamiento.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { auditar } from '../auditoria/service.js';
import { horaDeAccion } from '../campo/comun.js';
import { refParaSubir, refParaVer, type Actor, type Ref } from './referencias.js';

/** Minutos que vale el enlace para ver un archivo (privado: se pide de nuevo cada vez que se abre la pantalla). */
const SEGUNDOS_DESCARGA = 10 * 60;

const donde = (r: Ref) => sql`${sql(r.columna)} = ${r.id}`;
const autor = (a: Actor) => (a.tipo === 'usuario' ? sql`subido_por = ${a.usuarioId}` : sql`portal_acceso_id = ${a.accesoId}`);
const mesAsuncion = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit' }).format(new Date());

async function enTx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(fn)) as T;
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    const pg = e as { code?: string; constraint_name?: string };
    if (pg.code === '23505' && pg.constraint_name === 'uq_archivo_odometro') throw new ErrorApp(409, 'Ese viaje ya tiene la foto del odómetro');
    traducirErrorPg(e);
  }
}

type Solicitado = { id: string; estado: 'PENDIENTE' | 'SUBIDO'; ruta: string; mime: string };

/**
 * Paso 1: registra el archivo PENDIENTE (idempotente por clave) y devuelve a dónde subirlo.
 * El celular sube directo a Storage (no pasa por la API: el límite de cuerpo de Vercel no alcanza para fotos).
 */
export async function solicitarSubida(a: Actor, d: SolicitarArchivo) {
  const alm = almacenamiento(); // sin Storage configurado, 503 antes de registrar nada
  const r = await enTx<Solicitado>(async (tx) => {
    const [previo] = await tx`SELECT id, estado, ruta, mime FROM archivo WHERE clave_idempotencia = ${d.claveIdempotencia} AND ${autor(a)}`;
    if (previo) return previo as Solicitado;
    const ref = await refParaSubir(tx, a, d);
    // Odómetro: "ya hay" se cuenta por momento (salida / vuelta); el resto, por tipo.
    const [{ subidos, total }] = await tx`
      SELECT count(*) FILTER (WHERE estado = 'SUBIDO')::int AS subidos, count(*)::int AS total
      FROM archivo WHERE ${donde(ref)} AND tipo = ${d.tipo}
    `;
    const max = MAX_POR_REFERENCIA[d.tipo];
    if (subidos >= max) throw new ErrorApp(409, max === 1 ? 'Ya está la foto: no se puede reemplazar' : `Ya hay ${max} archivos cargados acá`);
    // Freno a pedidos que nunca se suben (un enlace o un celular en bucle no llena la tabla).
    if (total >= max * 5) throw new ErrorApp(429, 'Demasiados intentos de subida: avisá a la oficina');
    const h = await horaDeAccion(tx, d.tomadaAt);
    const id = crypto.randomUUID();
    const ruta = `${d.tipo.toLowerCase()}/${mesAsuncion()}/${id}.${extensionDe(d.mime)}`;
    const [fila] = await tx`
      INSERT INTO archivo (id, tipo, ruta, mime, bytes_declarados, ${sql(ref.columna)}, subido_por, portal_acceso_id, clave_idempotencia, tomada_at, sin_senal)
      VALUES (${id}, ${d.tipo}, ${ruta}, ${d.mime}, ${d.bytes}, ${ref.id}, ${a.tipo === 'usuario' ? a.usuarioId : null},
              ${a.tipo === 'portal' ? a.accesoId : null}, ${d.claveIdempotencia}, coalesce(${h.hora}::timestamptz, clock_timestamp()), ${h.sinSenal})
      RETURNING id, estado, ruta, mime
    `;
    return fila as Solicitado;
  });
  if (r.estado === 'SUBIDO') return { id: r.id, estado: r.estado };
  return { id: r.id, estado: r.estado, subirA: await alm.firmarSubida(r.ruta), mime: r.mime };
}

/** Paso 3: la API mira el objeto real en Storage (tamaño y tipo) y recién ahí lo da por subido. */
export async function confirmarSubida(a: Actor, id: string) {
  const [f] = await sql`SELECT id, tipo, ruta, mime, estado FROM archivo WHERE id = ${id} AND ${autor(a)}`;
  if (!f) throw new ErrorApp(404, 'Archivo no encontrado');
  if (f.estado === 'SUBIDO') return { id, estado: 'SUBIDO', repetido: true };
  const alm = almacenamiento();
  const info = await alm.info(f.ruta);
  if (!info) throw new ErrorApp(409, 'El archivo todavía no se subió');
  const tope = maxBytesDe(f.mime);
  if (info.bytes > tope || (info.mime && info.mime !== f.mime)) {
    await alm.borrar(f.ruta);
    throw new ErrorApp(400, info.bytes > tope ? `El archivo supera el máximo de ${Math.round(tope / 1048576)} MB` : 'El tipo de archivo no coincide con lo declarado');
  }
  return enTx(async (tx) => {
    const [u] = await tx`
      UPDATE archivo SET estado = 'SUBIDO', bytes = ${info.bytes}, subido_at = clock_timestamp()
      WHERE id = ${id} AND estado = 'PENDIENTE' RETURNING id
    `;
    if (!u) return { id, estado: 'SUBIDO', repetido: true };
    if (a.tipo === 'usuario') {
      await auditar({ usuarioId: a.usuarioId, accion: 'archivo.subir', recurso: 'archivo', recursoId: id, ip: a.ip, metadata: { tipo: f.tipo, bytes: info.bytes } }, tx);
    }
    return { id, estado: 'SUBIDO', repetido: false };
  });
}

/** Archivos subidos de una cosa, con enlace temporal para verlos. */
export async function listarArchivos(a: Actor, f: FiltroArchivos) {
  const filas = await enTx<Record<string, unknown>[]>(async (tx) => {
    const ref = await refParaVer(tx, a, f);
    return [
      ...(await tx`
        SELECT ar.id, ar.tipo, ar.mime, ar.bytes, ar.tomada_at, ar.sin_senal, ar.subido_at, ar.ruta,
               coalesce(u.username, 'Cliente') AS subido_por
        FROM archivo ar LEFT JOIN usuario u ON u.id = ar.subido_por
        WHERE ar.${sql(ref.columna)} = ${ref.id} AND ar.estado = ${'SUBIDO'} ORDER BY ar.tomada_at, ar.id
      `),
    ];
  });
  const alm = filas.length ? almacenamiento() : null;
  return Promise.all(
    filas.map(async ({ ruta, ...resto }) => ({ ...resto, url: await alm!.firmarDescarga(ruta as string, SEGUNDOS_DESCARGA) }))
  );
}

/** Uso del almacenamiento (el plan gratuito de Supabase trae 1 GB). Solo admin. */
export async function usoAlmacenamiento() {
  const [r] = await sql`
    SELECT coalesce(sum(bytes), 0)::bigint::text AS bytes, count(*)::int AS archivos FROM archivo WHERE estado = ${'SUBIDO'}
  `;
  return { bytes: Number(r.bytes), archivos: r.archivos as number, limite_bytes: 1024 ** 3 };
}
