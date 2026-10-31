-- MIGRACIÓN 0002: ROL PROPIO DE LA API (afull_api). La contraseña se asigna aparte con ALTER ROLE.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afull_api') THEN
    CREATE ROLE afull_api LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

ALTER ROLE afull_api SET statement_timeout = '15s';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO afull_api;

GRANT SELECT, INSERT, UPDATE ON persona, usuario TO afull_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON sesion TO afull_api;
GRANT SELECT, INSERT, DELETE ON permiso_capacidad TO afull_api;
GRANT SELECT, INSERT, UPDATE ON secuencia_contador TO afull_api;
GRANT SELECT, INSERT ON evento_auditoria TO afull_api;
GRANT EXECUTE ON FUNCTION siguiente_valor(VARCHAR) TO afull_api;

DROP POLICY IF EXISTS api_acceso ON persona;
CREATE POLICY api_acceso ON persona FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON usuario;
CREATE POLICY api_acceso ON usuario FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON sesion;
CREATE POLICY api_acceso ON sesion FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON permiso_capacidad;
CREATE POLICY api_acceso ON permiso_capacidad FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON secuencia_contador;
CREATE POLICY api_acceso ON secuencia_contador FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_lectura ON evento_auditoria;
CREATE POLICY api_lectura ON evento_auditoria FOR SELECT TO afull_api USING (true);

DROP POLICY IF EXISTS api_insercion ON evento_auditoria;
CREATE POLICY api_insercion ON evento_auditoria FOR INSERT TO afull_api WITH CHECK (true);
