-- MIGRACIÓN 0001: LOOP 0 - FUNDACIÓN, SEGURIDAD, AUTH Y AUDITORÍA

CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS persona (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(150) NOT NULL,
  ci VARCHAR(30) UNIQUE NOT NULL,
  cargo VARCHAR(100),
  departamento VARCHAR(100),
  jefe_id UUID REFERENCES persona(id) ON DELETE SET NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_persona_updated_at ON persona;
CREATE TRIGGER trg_persona_updated_at
BEFORE UPDATE ON persona
FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

CREATE TABLE IF NOT EXISTS usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID UNIQUE REFERENCES persona(id) ON DELETE SET NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_usuario_updated_at ON usuario;
CREATE TRIGGER trg_usuario_updated_at
BEFORE UPDATE ON usuario
FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

CREATE TABLE IF NOT EXISTS sesion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  ip VARCHAR(50),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sesion_usuario_id ON sesion(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesion_expires_at ON sesion(expires_at);

CREATE TABLE IF NOT EXISTS permiso_capacidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  capacidad VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_capacidad_valida CHECK (
    capacidad IN ('admin', 'diseno', 'taller', 'ver_costos', 'montaje', 'comercial', 'rrhh')
  ),
  CONSTRAINT uq_usuario_capacidad UNIQUE(usuario_id, capacidad)
);

CREATE TABLE IF NOT EXISTS secuencia_contador (
  id VARCHAR(50) PRIMARY KEY,
  ultimo_valor BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION siguiente_valor(p_id VARCHAR)
RETURNS BIGINT LANGUAGE sql AS $$
  INSERT INTO secuencia_contador (id, ultimo_valor) VALUES (p_id, 1)
  ON CONFLICT (id) DO UPDATE
    SET ultimo_valor = secuencia_contador.ultimo_valor + 1,
        updated_at = now()
  RETURNING ultimo_valor;
$$;

CREATE TABLE IF NOT EXISTS evento_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  accion VARCHAR(100) NOT NULL,
  recurso VARCHAR(150) NOT NULL,
  recurso_id VARCHAR(100),
  ip VARCHAR(50),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_id ON evento_auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_recurso ON evento_auditoria(recurso, recurso_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON evento_auditoria(created_at DESC);

CREATE OR REPLACE FUNCTION bloquear_modificacion_inmutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Operación denegada: la tabla % es estrictamente inmutable.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bloquear_modificacion_auditoria ON evento_auditoria;
CREATE TRIGGER trg_bloquear_modificacion_auditoria
BEFORE UPDATE OR DELETE ON evento_auditoria
FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_bloquear_truncate_auditoria ON evento_auditoria;
CREATE TRIGGER trg_bloquear_truncate_auditoria
BEFORE TRUNCATE ON evento_auditoria
FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER TABLE persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesion ENABLE ROW LEVEL SECURITY;
ALTER TABLE permiso_capacidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE secuencia_contador ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_auditoria ENABLE ROW LEVEL SECURITY;
