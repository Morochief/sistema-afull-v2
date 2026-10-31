-- MIGRACIÓN 0003: MITIGACIÓN DE FUERZA BRUTA

CREATE TABLE IF NOT EXISTS intento_login (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL,
  ip VARCHAR(50),
  exito BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intento_username ON intento_login(lower(username), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intento_ip ON intento_login(ip, created_at DESC);

ALTER TABLE intento_login ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON intento_login FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON intento_login TO afull_api;

DROP POLICY IF EXISTS api_acceso ON intento_login;
CREATE POLICY api_acceso ON intento_login FOR ALL TO afull_api USING (true) WITH CHECK (true);
