-- MIGRACIÓN 0004: CLIENTES Y ÓRDENES DE TRABAJO (Loop 1A)

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL CHECK (btrim(nombre) <> ''),
  razon_social VARCHAR(255),
  ruc VARCHAR(30) UNIQUE,
  telefono VARCHAR(50),
  email VARCHAR(255),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cliente_nombre_trgm ON cliente USING gin (nombre extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cliente_razon_trgm  ON cliente USING gin (razon_social extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cliente_ruc_trgm    ON cliente USING gin (ruc extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cliente_codigo_trgm ON cliente USING gin (codigo extensions.gin_trgm_ops);

CREATE TABLE IF NOT EXISTS cliente_contacto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  nombre VARCHAR(150) NOT NULL CHECK (btrim(nombre) <> ''),
  cargo VARCHAR(100),
  telefono VARCHAR(50),
  email VARCHAR(255),
  es_principal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacto_principal ON cliente_contacto (cliente_id)
  WHERE es_principal AND activo;

CREATE TABLE IF NOT EXISTS cliente_marca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  nombre VARCHAR(100) NOT NULL CHECK (btrim(nombre) <> ''),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marca_cliente_nombre ON cliente_marca (cliente_id, lower(nombre));

CREATE TABLE IF NOT EXISTS sucursal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  nombre VARCHAR(255) NOT NULL CHECK (btrim(nombre) <> ''),
  ciudad VARCHAR(100),
  direccion TEXT,
  gps_lat NUMERIC(10,7) NOT NULL CHECK (gps_lat BETWEEN -27.7 AND -19.2),
  gps_lng NUMERIC(10,7) NOT NULL CHECK (gps_lng BETWEEN -62.7 AND -54.2),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sucursal_id_cliente UNIQUE (id, cliente_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sucursal_cliente_nombre ON sucursal (cliente_id, lower(nombre));

CREATE TABLE IF NOT EXISTS orden_trabajo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ot VARCHAR(50) UNIQUE NOT NULL,
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  sucursal_id UUID,
  titulo VARCHAR(255) NOT NULL CHECK (btrim(titulo) <> ''),
  descripcion TEXT,
  fecha_prometida DATE,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','EN_DISENO','EN_TALLER','EN_MONTAJE','TERMINADO','CANCELADO')),
  creado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_ot_sucursal_del_cliente FOREIGN KEY (sucursal_id, cliente_id)
    REFERENCES sucursal (id, cliente_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_ot_estado ON orden_trabajo (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ot_cliente ON orden_trabajo (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ot_titulo_trgm ON orden_trabajo USING gin (titulo extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ot_codigo_trgm ON orden_trabajo USING gin (codigo_ot extensions.gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ot_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE RESTRICT,
  estado_anterior VARCHAR(30),
  estado_nuevo VARCHAR(30) NOT NULL,
  autor_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- CAMBIO vs. borrador: cancelar exige motivo también a nivel base (principio 2)
  CONSTRAINT chk_cancelar_con_motivo CHECK (
    estado_nuevo <> 'CANCELADO' OR btrim(coalesce(comentario, '')) <> ''
  )
);
CREATE INDEX IF NOT EXISTS idx_ot_evento_ot ON ot_evento (orden_trabajo_id, created_at);

DROP TRIGGER IF EXISTS trg_ot_evento_inmutable ON ot_evento;
CREATE TRIGGER trg_ot_evento_inmutable BEFORE UPDATE OR DELETE ON ot_evento
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_ot_evento_no_truncate ON ot_evento;
CREATE TRIGGER trg_ot_evento_no_truncate BEFORE TRUNCATE ON ot_evento
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_cliente_upd ON cliente;
CREATE TRIGGER trg_cliente_upd BEFORE UPDATE ON cliente FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

DROP TRIGGER IF EXISTS trg_sucursal_upd ON sucursal;
CREATE TRIGGER trg_sucursal_upd BEFORE UPDATE ON sucursal FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

DROP TRIGGER IF EXISTS trg_ot_upd ON orden_trabajo;
CREATE TRIGGER trg_ot_upd BEFORE UPDATE ON orden_trabajo FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

ALTER TABLE cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_contacto ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_marca ENABLE ROW LEVEL SECURITY;
ALTER TABLE sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_evento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON cliente, cliente_contacto, cliente_marca, sucursal, orden_trabajo, ot_evento FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON cliente, cliente_contacto, cliente_marca, sucursal, orden_trabajo TO afull_api;
GRANT SELECT, INSERT ON ot_evento TO afull_api;

DROP POLICY IF EXISTS api_acceso ON cliente;
CREATE POLICY api_acceso ON cliente FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON cliente_contacto;
CREATE POLICY api_acceso ON cliente_contacto FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON cliente_marca;
CREATE POLICY api_acceso ON cliente_marca FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON sucursal;
CREATE POLICY api_acceso ON sucursal FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON orden_trabajo;
CREATE POLICY api_acceso ON orden_trabajo FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_lectura ON ot_evento;
CREATE POLICY api_lectura ON ot_evento FOR SELECT TO afull_api USING (true);

DROP POLICY IF EXISTS api_insercion ON ot_evento;
CREATE POLICY api_insercion ON ot_evento FOR INSERT TO afull_api WITH CHECK (true);
