# Reglas del Proyecto Sistema aFull (Claude Code)

> **Archivo canónico de estado y decisiones:** lee siempre `TRASPASO.md` completo en la raíz del repositorio antes de actuar. Si hay cualquier diferencia entre este archivo y `TRASPASO.md`, **gana `TRASPASO.md`**.

## 2. Principios de ingeniería (no negociables)

1. **Eventos inmutables, no contadores.** Horas, estados y consumos son filas históricas. Saldos y costos se calculan sumando eventos.
2. **Restricciones duras en PostgreSQL**, no solo en código: un cronómetro abierto por persona, un viaje abierto por vehículo, idempotencia de eventos de campo, tarifas sin solapamiento.
3. **Nada se borra, todo se desactiva.** El rol de la API no tiene `DELETE` sobre tablas de negocio.
4. **Modularidad atómica.** Ningún archivo supera 250 líneas (lo hace cumplir ESLint `max-lines` y el CI). Un módulo por dominio con `routes.ts`, `service.ts` y tests. Un archivo por modal en el frontend, un hook `useX` por vista.
5. **Toda tabla administrativa** tiene paginación por servidor de 25 filas fijas, buscador con debounce de 300 ms, filtro de estado y rango de fechas.
6. **Guaraníes sin decimales** (`BIGINT`) en totales; tarifas, costos unitarios y costo por km en `NUMERIC(15,4)`. Redondeo una sola vez, al generar el snapshot de cierre de la OT.
7. **Trabajo por loops.** No se avanza al siguiente loop sin cerrar el actual con sus tests y criterios de aceptación.

---

## 3. Decisiones tomadas (no reabrir sin un problema real)

### Despliegue y costos
- **Stack gratuito:** Vercel (runtime **Node**, no Edge) + Supabase Free (región São Paulo) + GitHub Actions.
- **Frontend y API bajo el mismo sitio** (mismo proyecto de Vercel o subdominios del mismo dominio), porque la cookie es `SameSite=Lax` y no viaja entre sitios distintos.
- **Fly.io no es gratis en 2026** (sin plan gratuito, solo créditos de prueba). Queda como destino de migración futura si la API necesita un proceso siempre vivo.
- **Pendiente de verificar:** el plan Vercel Hobby es para uso no comercial según lo conocido. Revisar los términos actuales antes de operar con personal real.
- Dos entornos desde el día 1: proyectos Supabase `dev` y `prod`.

### Tiempo real
- **Supabase Broadcast**, no `postgres_changes` (este último respeta RLS y requiere Supabase Auth, que no se usa).
- La API publica un mensaje mínimo (tipo de evento e ID, sin datos sensibles) y el navegador vuelve a pedir el dato por la API con su sesión.
- Aislado tras una interfaz portable: `publicarLive()` / `suscribirseLive()`.
- El cronómetro corre en el navegador; solo se emiten cambios de estado (límite gratuito: 2 M mensajes/mes).

### Base de datos y seguridad
- **Dos roles:** las migraciones corren como `postgres`; la API se conecta como `afull_api` (sin ser dueño de nada, sin DDL, `NOBYPASSRLS`). Así la inmutabilidad de la auditoría es real a nivel motor.
- Conexión de la API por el **pooler de transacción (puerto 6543)** con `prepare: false`, `fetch_types: false` y el envoltorio `sinPipelining(sql)` en `apps/api/src/db/client.ts` con `postgres@3.4.9` fijo (sin `^`). Migraciones y backups por conexión directa o pooler en modo sesión (puerto 5432 del pooler).
- **Mitigación del pooler 6543 (mitigado, causa sin confirmar):** toda consulta `sql` en `apps/api/src` pasa por `sinPipelining(sql)` (`options.onexecute = () => false`) e interpola al menos un parámetro `${...}`. En `vitest.config.ts` mantener siempre `fileParallelism: false`.
- **RLS activado en todas las tablas**, `REVOKE ALL` a `anon` y `authenticated`, y `REVOKE EXECUTE` sobre funciones (cierra el RPC de PostgREST).
- **Regla para toda tabla nueva** (tres pasos, al final de cada migración):
  ```sql
  ALTER TABLE nueva ENABLE ROW LEVEL SECURITY;
  GRANT <solo lo necesario> ON nueva TO afull_api;   -- nunca DELETE en tablas de negocio
  CREATE POLICY api_acceso ON nueva FOR ALL TO afull_api USING (true) WITH CHECK (true);
  ```
  Tablas append-only (auditoría, eventos): políticas separadas de `SELECT` e `INSERT`, y trigger que bloquea `UPDATE`, `DELETE` y `TRUNCATE`.
- **Regla para toda función nueva (desde 0005):** por defecto, ninguna función nueva es ejecutable por nadie más que `postgres` (ni siquiera por `afull_api`). Toda migración que cree una función que la API llame directamente debe incluir `GRANT EXECUTE ON FUNCTION ... TO afull_api`. Las funciones de trigger **no** lo necesitan (PostgreSQL no revisa `EXECUTE` al disparar triggers). Si se olvida un `GRANT`, falla cerrado con `42501` en los tests.
- Códigos secuenciales (`OT-2026-0001`, `CLI-0001`) con la función atómica `siguiente_valor()`, **dentro de la misma transacción** que el insert. Nunca `MAX()+1`.
- Capacidades atómicas (`admin`, `comercial`, `diseno`, `taller`, `montaje`, `ver_costos`, `rrhh`) con `CHECK` en la base. Los "roles" son solo plantillas de interfaz. `admin` pasa siempre.

### Autenticación
- Argon2id con `@node-rs/argon2` (OWASP: 19 MiB, 2 iteraciones, 1 hilo; apuntar a 100–300 ms en Vercel; medido en `gru1`: `147–163 ms`, mediana `152 ms` en caliente sobre `a588fbb`, y `1253 ms` en cold start sobre `703c0ec` — pendiente decisión del usuario si se acepta el cold start como excepción).
- Token de 32 bytes aleatorios en la cookie `afull_session` (`HttpOnly`, `Secure`, `SameSite=Lax`). En la base solo se guarda su SHA-256.
- Sesión validada en cada request contra `sesion` y `usuario.activo` (revocación instantánea). Expiración deslizante de 30 días; `last_active_at` se refresca como máximo cada 5 minutos.
- CSRF: `SameSite=Lax` más verificación del header `Origin` en toda petición que modifica datos.
- Fuerza bruta: tabla `intento_login` (5 fallos por usuario o 20 por IP en 15 minutos). Mensaje de error idéntico para usuario inexistente, inactivo o clave mala.
- La auditoría de mutaciones va **dentro de la misma transacción**. La de login/logout va fuera, con `try/catch`, para que una falla de auditoría no deje a todos sin entrar.
- `metadata` de auditoría nunca lleva contraseñas ni tokens (`limpiarMetadata` los filtra, pero no depender de eso).

### Dominio
- Una OT tiene **una sola sucursal**. La sucursal debe pertenecer al cliente de la OT (FK compuesta).
- `TERMINADO` y `CANCELADO` son **estados finales**. Cancelar exige motivo.
- Máquina de estados de la OT en `packages/shared/machines/ot.ts`:
  `PENDIENTE → EN_DISENO | EN_TALLER | CANCELADO`; `EN_DISENO → EN_TALLER | CANCELADO`; `EN_TALLER → EN_MONTAJE | TERMINADO | CANCELADO`; `EN_MONTAJE → TERMINADO | CANCELADO`.
- Cada transición usa `SELECT ... FOR UPDATE` y exige el campo `desde` (el estado que el usuario veía): si cambió, responde `409`.
- `ot_evento` es el historial inmutable; `orden_trabajo.estado` es solo el último valor.
- Auditoría de flota: se compara el odómetro contra la **distancia de ruta de las paradas planificadas** (`hoja_ruta_parada`), no contra Haversine entre inicio y fin. La alerta es informativa, nunca bloqueante.
- La geocerca de asistencia (100 m) es **disuasiva**, no seguridad dura: el GPS del navegador es falsificable.

---

## 11. Cómo trabajar (para Claude Code o una sesión nueva)

1. Leer `TRASPASO.md` completo (que incluye e invalida diferencias previas del documento maestro `ARQUITECTURA_V3.md`). Resumir el estado en 10 líneas para confirmar alineación.
2. Tratar todo lo "sin verificar" como tal. Marcar con claridad lo que no se pudo ejecutar.
3. No reabrir decisiones de la sección 3 sin un problema real; si lo hay, explicarlo.
4. Verificar precios, límites y versiones actuales de servicios externos antes de afirmarlos.
5. Antes de cerrar una tarea: tests en verde, lint en verde, archivo ≤ 250 líneas, y actualizar la sección 0 y "Siguiente paso" de `TRASPASO.md`.
6. Los fallos de tests no se "ajustan para que pasen": primero se investiga si revelan un permiso o una restricción mal puestos.
7. En scripts de prueba contra `dev`, el bloque `finally` debe limpiar **únicamente** los datos creados por ese script (ej. `WHERE username = 'zz_test_...'`), sin barrer filas ajenas.

---

## 12. Protocolo de Trabajo Conjunto (Antigravity ↔ Claude Code)

En este proyecto operamos en esquema de **control cruzado**:
- **Antigravity (Proponente / Ejecutor):** redacta propuestas técnicas, escribe el código y ejecuta comandos en terminal nativa de Windows (`pnpm test`, `lint`, `typecheck`, `git`, mediciones HTTP/DB) dado que la unidad `C:` tiene poco espacio libre para levantar la VM de Claude.
- **Claude Code (Auditor / Revisor):** tiene lectura y escritura directa sobre `D:\sistema-afull` (sin ejecutar terminal). Verifica propuestas e implementaciones leyendo directamente los archivos del repositorio, contrasta contra `TRASPASO.md` y `ARQUITECTURA_V3.md`, detecta huecos o supuestos no demostrados y escribe su dictamen en `MESA_DE_TRABAJO.md`.

### Reglas de `D:\sistema-afull\MESA_DE_TRABAJO.md`
1. **Evidencia cruda, no resumida:** Para toda afirmación empírica (ej. "36/36 en verde", "1253 ms", "HTTP 200"), Antigravity debe pegar en `MESA_DE_TRABAJO.md` el comando ejecutado y la salida literal de terminal (o link/ID del CI run), sin editar.
2. **Rondas numeradas con fecha y cierre exclusivo del usuario:** Cada ciclo lleva el encabezado `Ronda N (YYYY-MM-DD HH:mm)` con las secciones `### Propuesta / Entrega (Antigravity)`, `### Dictamen (Claude Code)`, `### Respuesta / Ejecución (Antigravity)` y `**Cerrado por:** [pendiente del usuario]`. Ninguno de los dos agentes da una ronda por cerrada por su cuenta.
3. **Ninguno de los dos resume ni sobrescribe el texto del otro:** Dentro de una ronda abierta, cada agente únicamente **agrega** su nueva sección al final del archivo (`append`), conservando íntegros todos los dictámenes, propuestas y evidencias previas de esa ronda.
4. **Mesa efímera (sin acumulación entre rondas cerradas):** Solo cuando el usuario marca una ronda como cerrada, se pasa un resumen de una línea a la bitácora de `TRASPASO.md` (Sección 13) y se vacía `MESA_DE_TRABAJO.md` para la ronda siguiente.



