# Procedimiento de Restauración ante Desastres (`RESTAURAR.md`)

Este documento describe el procedimiento exacto para restaurar un respaldo cifrado de la base de datos de **Sistema aFull** en un proyecto nuevo de Supabase o en una instancia limpia de PostgreSQL 17, cumpliendo el criterio **CA-0.9**.

> **Regla de seguridad:** Nunca incluir contraseñas reales, cadenas de conexión completas ni `BACKUP_PASSPHRASE` en este archivo. `BACKUP_PASSPHRASE` debe estar guardada tanto en GitHub Secrets como en un gestor de contraseñas externo del administrador.

---

## 1. Formato requerido de la conexión de respaldo (Puerto 5432, IPv4)

`pg_dump` y `pg_restore` **no deben usar el Transaction Pooler (puerto 6543)** porque las sesiones pueden rotar o bloquear comandos de sesión. Como los runners de GitHub Actions operan sobre IPv4, la variable `PROD_DATABASE_URL_BACKUP` (y `DEV_DATABASE_URL_ADMIN`) debe usar el **Session Pooler de Supabase en el puerto 5432**:

```text
postgresql://postgres.<project-ref>:<password>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
```

---

## 2. Herramientas necesarias en Windows (sin usar espacio en `C:`)

1. **GnuPG (`gpg`):** Ya viene incluido en Git for Windows en:
   ```powershell
   & "C:\Program Files\Git\usr\bin\gpg.exe" --version
   ```
2. **Cliente PostgreSQL 17 (`psql.exe` y `pg_restore.exe`):**
   - Si no están en el `PATH` y la unidad `C:` tiene poco espacio, descargar el archivo ZIP de binarios sin instalador de PostgreSQL 17 para Windows x64 desde EnterpriseDB (`postgresql-17.x-1-windows-x64-binaries.zip`, ~310 MB) directamente en `D:\tools\pgsql` y agregar `D:\tools\pgsql\pgsql\bin` al `PATH` de la sesión de PowerShell:
     ```powershell
     $env:PATH = "D:\tools\pgsql\pgsql\bin;$env:PATH"
     psql --version
     pg_restore --version
     ```

---

## 3. Paso a paso de la Restauración

### Paso 1 — Obtener y descifrar el respaldo

1. En GitHub → **Actions → Respaldo diario de la base**, ejecutar `Run workflow` eligiendo el entorno (`dev` o `prod`), o elegir la última corrida verde.
2. Descargar el artefacto `respaldo-db-<origen>` y descomprimir el `.zip` de GitHub en una carpeta temporal en `D:` (por ejemplo `D:\restore-temp\`), obteniendo `afull-db-<origen>-YYYY-MM-DD.pgdump.gpg`.
3. Descifrar el archivo con `gpg` (usando `--pinentry-mode loopback` sin `--passphrase` para que `gpg` pida la clave de forma interactiva sin eco, sin alterar caracteres por el pipe de PowerShell y sin dejarla en el historial de `PSReadLine`):
   ```powershell
   Set-Location D:\restore-temp
   & "C:\Program Files\Git\usr\bin\gpg.exe" --pinentry-mode loopback `
     --decrypt -o dump_restaurado.pgdump afull-db-dev-YYYY-MM-DD.pgdump.gpg
   ```

### Paso 2 — Preparar la base de datos de destino

Definir en la terminal la URL de administración (puerto `5432`, rol `postgres`) de la base limpia de destino (por ejemplo, un proyecto temporal `afull-restore-drill` en Supabase o una instancia local de PostgreSQL 17 en `D:`):

```powershell
$secDest = Read-Host -Prompt "Pegar DEST_URL (postgres puerto 5432)" -AsSecureString
$bstrDest = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secDest)
$env:DEST_URL = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstrDest)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrDest)
```

Crear el esquema `extensions`, la extensión `pg_trgm`, los roles base y el rol operativo `afull_api` (con los atributos exactos de `0002_rol_api.sql`, **sin** ejecutar los `GRANT` sobre tablas que aún no existen):

```powershell
@'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'supabase_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afull_api') THEN
    CREATE ROLE afull_api LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

ALTER ROLE afull_api SET statement_timeout = '15s';
'@ | psql "$env:DEST_URL" -v ON_ERROR_STOP=1
```

### Paso 3 — Filtrar el índice del volcado (TOC) y ejecutar `pg_restore`

El volcado incluye tanto el esquema `public` como `drizzle` (historial de migraciones `drizzle.__drizzle_migrations`) y conserva todos los `GRANT`/`REVOKE`.
Para evitar que `pg_restore --exit-on-error` falle al intentar recrear o comentar el esquema `public` (que ya existe) o al ejecutar `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` (sobre el cual `postgres` no tiene permiso en un proyecto Supabase nuevo), se filtra el listado TOC antes de restaurar:

```powershell
pg_restore -l dump_restaurado.pgdump |
  Where-Object {
    $_ -notmatch '; \d+ \d+ SCHEMA - public ' -and
    $_ -notmatch '; \d+ \d+ COMMENT - SCHEMA public ' -and
    $_ -notmatch 'DEFAULT ACL.*supabase_admin'
  } |
  Set-Content -Encoding ASCII restore.toc

pg_restore -L restore.toc --no-owner --exit-on-error -d "$env:DEST_URL" dump_restaurado.pgdump
```

### Paso 4 — Reaplicar bloqueo de privilegios por defecto y asignar clave a `afull_api`

Reaplicar el bloqueo de `DEFAULT PRIVILEGES` (incluyendo el `REVOKE EXECUTE ON FUNCTIONS` global de `postgres` para anular el privilegio implícito de `PUBLIC`) y asignar una contraseña nueva al rol `afull_api` con `\password afull_api` (que solicita y confirma la clave sin eco y sin dejarla en el historial de PowerShell):

```powershell
@'
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
'@ | psql "$env:DEST_URL" -v ON_ERROR_STOP=1

psql "$env:DEST_URL" -v ON_ERROR_STOP=1 -c "\password afull_api"

$secApiUrl = Read-Host -Prompt "Pegar DEST_API_URL (conectando como afull_api.<ref-destino>)" -AsSecureString
$bstrApiUrl = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secApiUrl)
$env:DEST_API_URL = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstrApiUrl)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrApiUrl)
Remove-Variable secApiUrl -ErrorAction SilentlyContinue
```

### Paso 5 — Verificación de integridad, triggers inmutables y permisos (no destructiva)

Ejecutar las siguientes consultas de comprobación contra `$env:DEST_URL` y `$env:DEST_API_URL`, y **comparar los resultados contra las líneas `tablas: ... | migraciones: ... | triggers_inmutables: ... | defacl_postgres: ...` y `usuarios: ... | clientes: ... | ots: ...` del log del run de GitHub Actions** del cual se descargó el artefacto:

```powershell
# 1. Conteo de tablas en public y migraciones de Drizzle (>= 5)
psql "$env:DEST_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
psql "$env:DEST_URL" -Atc "SELECT count(*) FROM drizzle.__drizzle_migrations;"

# 2. Triggers inmutables activos que usan bloquear_modificacion_inmutable (debe devolver 4 en Loop 1)
psql "$env:DEST_URL" -Atc "SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.proname = 'bloquear_modificacion_inmutable' AND NOT t.tgisinternal AND t.tgenabled = 'O';"

# 3. Conteos de datos principales
psql "$env:DEST_URL" -Atc "SELECT (SELECT count(*) FROM usuario) AS usuarios, (SELECT count(*) FROM cliente) AS clientes, (SELECT count(*) FROM orden_trabajo) AS ots;"

# 4. Verificación en catálogo de permisos de afull_api (debe devolver 't|f') y de anon (debe devolver 'f|f')
psql "$env:DEST_URL" -Atc "SELECT has_table_privilege('afull_api', 'usuario', 'SELECT'), has_table_privilege('afull_api', 'cliente', 'DELETE');"
psql "$env:DEST_URL" -Atc "SELECT has_function_privilege('anon', 'siguiente_valor(varchar)', 'EXECUTE'), has_table_privilege('anon', 'usuario', 'SELECT');"

# 5. Prueba real conectando directamente como afull_api (sin SET ROLE y sin riesgo de borrar filas):
#    a) Lectura permitida:
psql "$env:DEST_API_URL" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM usuario;"
#    b) DELETE no destructivo dentro de transacción con ROLLBACK (debe fallar con SQLSTATE 42501 permission denied for table cliente):
psql "$env:DEST_API_URL" -v VERBOSITY=verbose -Atc "BEGIN; DELETE FROM cliente WHERE false; ROLLBACK;"

# 6. Comprobación funcional de privilegios por defecto (D5-1):
#    Toda función nueva debe nacer con EXECUTE cerrado para anon (debe devolver 'f')
psql "$env:DEST_URL" -v ON_ERROR_STOP=1 -Atc "BEGIN; CREATE FUNCTION public.zz_probe_defacl() RETURNS int LANGUAGE sql AS 'select 1'; SELECT has_function_privilege('anon', 'public.zz_probe_defacl()', 'EXECUTE'); ROLLBACK;"
```

### Paso 6 — Conectar la API y borrar archivos temporales

1. Actualizar `DATABASE_URL` en el entorno de la API apuntando al **Transaction Pooler (puerto 6543)** del proyecto restaurado con el usuario `afull_api.<ref-destino>` y la nueva contraseña.
2. Verificar que `POST /api/auth/login` y `GET /api/auth/yo` respondan `200 OK`.
3. Eliminar de forma segura los archivos temporales descifrados y variables de sesión:
   ```powershell
   Remove-Item D:\restore-temp\dump_restaurado.pgdump, D:\restore-temp\restore.toc -Force
   Remove-Item Env:\DEST_URL, Env:\DEST_API_URL -ErrorAction SilentlyContinue
   ```

---

## 4. Registro del Simulacro Manual de Restauración (CA-0.9)

- **Estado:** Pendiente de ejecución manual por el usuario.
- **Fecha de ejecución:** *(completar)*
- **Artefacto restaurado:** *(nombre del archivo `.pgdump.gpg` y ID del run de GitHub Actions)*
- **Destino utilizado:** *(ej. proyecto temporal Supabase `afull-restore-drill` o PostgreSQL 17 local en `D:`)*
- **Resultado de verificaciones (Paso 5):**
  - Tablas en `public`: *(origen -> destino)*
  - Filas en `drizzle.__drizzle_migrations`: *(origen -> destino, >= 5)*
  - Triggers `bloquear_modificacion_inmutable`: *(origen -> destino)*
  - `DELETE FROM cliente` como `afull_api`: *(confirmar rechazo `42501`)*
  - `anon` bloqueado (`f|f`): *(confirmar)*
  - Función nueva con `anon` bloqueado (`f`, D5-1): *(confirmar)*
