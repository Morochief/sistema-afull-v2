import postgres, { type Sql } from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL no configurada.');
}

/**
 * Desactiva el pipelining de consultas sobre una misma conexión cuando se usa el
 * pooler de transacciones (Supavisor, puerto 6543) con `prepare: false`.
 *
 * En `postgres@3.4.9`, las consultas con parámetros (`parameters.length >= 1`) activan
 * `describeFirst = true`, lo que hace que `execute(q)` devuelva `false` y mueva la
 * conexión a la cola `full` (estrictamente una consulta por ciclo `ReadyForQuery`).
 * En cambio, las consultas sin parámetros (`parameters.length === 0`) dejan
 * `describeFirst = false`, devolviendo `true` en `execute(q)` y moviendo la conexión a
 * la cola `busy`. Si llega otra consulta con parámetros mientras esa conexión está en
 * `busy`, `postgres-js` encadena `Parse + Describe + Flush` (sin `Sync`) en el mismo
 * socket detrás de la consulta previa, lo que queda colgado al cruzar el límite de
 * transacción del pooler.
 *
 * Al definir `options.onexecute = () => false` en toda `Query` creada por plantilla
 * (sin tocar el `onexecute` interno que `sql.begin` inyecta en `BEGIN`), `execute(q)`
 * devuelve siempre `false` y ninguna conexión entra en `busy`.
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
