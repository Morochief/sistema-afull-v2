-- Loop 0 (cierre): rol de solo lectura para el respaldo diario (pg_dump). docs/LOOP_0_RESPALDOS_DISENO.md
-- Sin clave acá: se le pone por entorno con ALTER ROLE ... LOGIN PASSWORD '<verificador SCRAM>' (la clave real no sale de la
-- compu del usuario). BYPASSRLS porque pg_dump no lee tablas con RLS si el rol no lo salta. Nada de escribir ni ejecutar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afull_respaldo') THEN
    CREATE ROLE afull_respaldo NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;
ALTER ROLE afull_respaldo SET statement_timeout = '0';

GRANT USAGE ON SCHEMA public, drizzle TO afull_respaldo;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO afull_respaldo;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO afull_respaldo;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO afull_respaldo;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO afull_respaldo;

-- Las tablas futuras (las crean las migraciones, como postgres) también se pueden respaldar.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO afull_respaldo;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO afull_respaldo;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA drizzle GRANT SELECT ON TABLES TO afull_respaldo;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA drizzle GRANT SELECT ON SEQUENCES TO afull_respaldo;

-- Para que los tests puedan comprobar la lectura con SET ROLE sin ponerle clave (no hereda nada: INHERIT FALSE).
GRANT afull_respaldo TO postgres WITH INHERIT FALSE, SET TRUE;
