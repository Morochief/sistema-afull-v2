import postgres, { type Sql } from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL no configurada.');
}

/**
 * Mitigación para el pooler de transacciones (Supavisor, puerto 6543) con `prepare: false`.
 * Estado: MITIGADO, CAUSA SIN CONFIRMAR (hipótesis basada en lectura de `postgres@3.4.9`).
 *
 * IMPORTANTE: Este envoltorio depende de `options.onexecute`, que es un detalle interno de
 * `postgres-js` (`src/connection.js`) y NO forma parte de su API pública. Por ese motivo, la
 * dependencia `postgres` está fijada en la versión exacta `"3.4.9"` (sin `^`) en `package.json`.
 * No actualizar `postgres` sin correr contra Supabase `dev` el test de 40 consultas mixtas
 * en `tests/loop0/secuencia.test.ts` y las 20 requests HTTP de `tests/loop1/ot-api.test.ts`.
 *
 * Hipótesis: En `postgres@3.4.9`, las consultas con parámetros (`parameters.length >= 1`) activan
 * `describeFirst = true`, haciendo que `execute(q)` devuelva `false` y mueva la conexión a `full`.
 * Las consultas sin parámetros (`parameters.length === 0`) dejan `describeFirst = false`, devolviendo
 * `true` en `execute(q)` y moviendo la conexión a `busy`, donde una consulta siguiente puede
 * encadenarse en el mismo socket antes de recibir `ReadyForQuery`.
 * Al definir `options.onexecute = () => false` en toda `Query` de plantilla (sin tocar el `onexecute`
 * interno que `sql.begin` inyecta en `BEGIN`), `execute(q)` devuelve siempre `false`.
 */
export function sinPipelining<T extends Sql>(instancia: T): T {
  return new Proxy(instancia, {
    apply(target, thisArg, args) {
      const res = Reflect.apply(target, thisArg, args) as { options?: { onexecute?: () => boolean } };
      if (res && typeof res === 'object' && 'options' in res && res.options && !res.options.onexecute) {
        res.options.onexecute = () => false;
      }
      return res;
    },
  });
}

// Pooler de transacciones (puerto 6543) exige prepare: false, fetch_types: false y sinPipelining
export const sql = sinPipelining(
  postgres(url, {
    prepare: false,
    fetch_types: false,
    max: 15,
    idle_timeout: 20,
    connect_timeout: 10,
  }),
);
