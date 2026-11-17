# Loop 0 (cierre): respaldos en plan gratis

> Decisión del usuario (2026-11-17): **todo el trabajo se mantiene en plan free**. Este diseño cierra CA-0.9 sin pagar Supabase Pro.

## 1. Qué hay y qué falta

**Hechos verificados (2026-11-17):**
- Supabase Free **no tiene respaldos automáticos**: ni diarios ni PITR. Permite **2 proyectos activos** (ya usamos los dos: `afull-dev` y `afull-demo`). Pausa el proyecto si una semana no recibe suficiente actividad de la base, y lo que cuenta son las consultas reales.
- GitHub, repo público: los artefactos duran **como máximo 90 días** y las Actions no cuestan. **Un cron se apaga solo y sin aviso si el repo pasa 60 días sin actividad.**

**Ya existe:** `backup-db.yml` hace `pg_dump`, lo restaura en un Postgres 17 limpio, verifica estructura, datos y permisos, lo cifra con GPG (`BACKUP_PASSPHRASE`) y lo sube como artefacto. Corrió en verde en noviembre. Le falta:
1. **No corre solo** (el cron está comentado, esperaba `afull-prod`). Además usa la clave de `postgres` (`DEV_DATABASE_URL_ADMIN`).
2. **No respalda `afull-demo`**, que es la base que usa Vercel y donde van a ir los datos reales mientras sigamos en plan free.
3. **No respalda Storage** (fotos, remisiones, comprobantes). `backup-storage.mjs` nunca existió en el repo.
4. Verifica el volcado **antes** de cifrarlo, no el archivo cifrado que se guarda.
5. No verifica que **la app** funcione sobre la base restaurada.
6. Falta el **simulacro hecho por una persona** (CA-0.9).

## 2. Diseño

### R1. Rol de solo lectura `afull_respaldo` (migración `0025_rol_respaldo`)
- `CREATE ROLE afull_respaldo NOLOGIN BYPASSRLS` (sin `BYPASSRLS`, `pg_dump` no puede leer tablas con RLS). `USAGE` en `public` y `drizzle`; `SELECT` en todas las tablas y secuencias; *default privileges* para que las tablas futuras también se puedan leer. Sin `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ni `EXECUTE`.
- La contraseña **no va en la migración**. Se pone por entorno con `ALTER ROLE afull_respaldo LOGIN PASSWORD '<verificador SCRAM>'`.
- La clave se genera **en la compu del usuario**. Ahí mismo se calcula el verificador SCRAM, que es lo único que pasa al conector de Supabase. La URL completa queda en un archivo que el usuario pega en el secreto de GitHub y después borra. La clave nunca pasa por el chat.
- Así, si se filtra el secreto, solo da lectura, y nunca se usa la clave de `postgres` de demo.

### R2. Respaldo diario automático (`backup-db.yml`)
- `schedule` diario a las **07:23 UTC** (04:23 en Asunción; lejos del inicio de la hora, cuando GitHub demora los crons). El cron respalda `demo`; a mano se puede elegir `demo` o `dev`.
- Secretos: `DEMO_DATABASE_URL_RESPALDO` (nuevo) y `BACKUP_PASSPHRASE` (ya existe).
- **Verifica el archivo cifrado:** se cifra primero, se descifra en el runner y se restaura **ese** archivo.
- **Prueba de la app sobre lo restaurado:** se levanta la API contra la base restaurada con un admin `zz_respaldo` creado en esa copia descartable. Tienen que responder:
  - el login;
  - `GET /api/clientes`;
  - `GET /api/reportes/registros` del mes;
  - `GET /api/panel`.
- Retención **90 días**, el máximo en repo público.
- **Anti-pausa de Supabase:** el respaldo diario hace consultas reales a la base de demo.
- **Anti-apagado del cron:** cada corrida llama a la API de GitHub para reactivar el propio workflow (`PUT …/actions/workflows/backup-db.yml/enable`, permiso `actions: write`), igual que hace la acción conocida *keepalive-workflow* en su modo API. **Sin verificar** que esto reinicie el contador de 60 días. Si el cron se apaga igual, GitHub manda mail al dueño por las corridas que faltan, y lo deja anotado `TRASPASO.md` §6.

### R3. Respaldo de Storage (`scripts/respaldo-archivos.mjs` + trabajo en el mismo workflow)
- Lista el bucket `afull-archivos` por carpetas (API de Storage, `POST /storage/v1/object/list/<bucket>`) y baja cada objeto. Arma un `.tar` y escribe `indice.json` con ruta, tamaño y sha256 de cada archivo.
- Lo compara con la base: cada `archivo` en estado `SUBIDO` tiene que estar en el tar.
- Lo cifra con la misma `BACKUP_PASSPHRASE`, lo descifra para verificar y lo sube como artefacto de 90 días.
- Secreto `DEMO_SUPABASE_SECRET_KEY`: es la misma clave que ya está en Vercel, copiada del panel de Supabase. **Si falta y hay archivos subidos, la corrida falla**; si falta y no hay archivos, avisa y sigue (hoy demo tiene 0 objetos).
- Restaurar los archivos es volver a subirlos con el mismo script en modo `--subir` (va en `RESTAURAR.md`).

### R4. Simulacro (CA-0.9)
- Automático: R2 lo hace todos los días con el archivo cifrado y la app.
- Persona: el usuario sigue `RESTAURAR.md` una vez en su compu: baja el último artefacto, lo descifra con su clave, lo restaura en un Postgres local y abre la app contra esa base. No hace falta un tercer proyecto Supabase, porque el plan free permite 2 y están ocupados. `RESTAURAR.md` se reescribe para ese camino, en pasos cortos para Windows.

## 3. Criterios de aceptación
- **CA-R.1** Migración `0025`: `afull_respaldo` lee todas las filas de una tabla con RLS, incluidas las tablas creadas después, y no puede escribir, borrar ni ejecutar funciones. Test que falla sin la migración.
- **CA-R.2** `backup-db.yml` corre por cron y a mano contra demo con `afull_respaldo`, verifica el archivo **cifrado** restaurado y la app (login + 3 endpoints), y sube el artefacto con 90 días.
- **CA-R.3** `respaldo-archivos.mjs`: con Storage en memoria (local) baja N objetos, el índice coincide en tamaños y sha256, y detecta un `archivo SUBIDO` que falta. En `--subir` vuelve a dejar los N objetos. Test local.
- **CA-R.4** Una corrida real del workflow en verde contra `afull-demo` (requiere que el usuario cargue los 2 secretos).
- **CA-R.5** `RESTAURAR.md` reescrito; el simulacro de una persona queda **pendiente del usuario** hasta que lo haga.

## 4. Lo que hace el usuario (y nada más)
1. Pegar en GitHub → Settings → Secrets → Actions el contenido del archivo que dejo en `D:\sistema-afull\Documentos\` como `DEMO_DATABASE_URL_RESPALDO`, y borrar el archivo.
2. Copiar la *secret key* de `afull-demo` (Supabase → Project Settings → API Keys) a `DEMO_SUPABASE_SECRET_KEY`.
3. Una vez: el simulacro de `RESTAURAR.md`.
