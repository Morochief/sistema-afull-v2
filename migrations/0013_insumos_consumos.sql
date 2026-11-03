-- MIGRACIÓN 0013: INSUMOS Y CONSUMOS (Loop 5, Claude Code, 2026-11-03).
-- Decisión del usuario: NO se lleva stock. Se registra qué material se usó en cada OT y a qué costo.
-- Cada operario carga lo que usó. El costo unitario se CONGELA en el consumo (el precio puede cambiar después).
-- Todo es append-only: una corrección es un consumo negativo que referencia al original (nunca UPDATE/DELETE).

CREATE TABLE IF NOT EXISTS insumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(150) NOT NULL CHECK (btrim(nombre) <> ''),
  unidad VARCHAR(15) NOT NULL CHECK (unidad IN
    ('UNIDAD', 'METRO', 'M2', 'PLANCHA', 'LITRO', 'KG', 'ROLLO', 'LATA', 'BOLSA', 'PAR', 'TIRA', 'MINUTO', 'KM')),
  sector VARCHAR(40),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_insumo_nombre_unidad ON insumo (lower(nombre), unidad);
DROP TRIGGER IF EXISTS trg_insumo_upd ON insumo;
CREATE TRIGGER trg_insumo_upd BEFORE UPDATE ON insumo FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- Historial de precios (el vigente es el último). Inmutable.
CREATE TABLE IF NOT EXISTS insumo_precio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES insumo(id) ON DELETE RESTRICT,
  costo_unitario_gs NUMERIC(15,4) NOT NULL CHECK (costo_unitario_gs >= 0),
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  cargado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_insumo_precio ON insumo_precio (insumo_id, vigente_desde DESC);
DROP TRIGGER IF EXISTS trg_insumo_precio_inmutable ON insumo_precio;
CREATE TRIGGER trg_insumo_precio_inmutable BEFORE UPDATE OR DELETE ON insumo_precio FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_insumo_precio_no_truncate ON insumo_precio;
CREATE TRIGGER trg_insumo_precio_no_truncate BEFORE TRUNCATE ON insumo_precio FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- La tarea de un consumo tiene que ser de la MISMA OT (FK compuesta).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tarea_id_ot') THEN
    ALTER TABLE tarea ADD CONSTRAINT uq_tarea_id_ot UNIQUE (id, orden_trabajo_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS consumo_insumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE RESTRICT,
  tarea_id UUID,
  insumo_id UUID NOT NULL REFERENCES insumo(id) ON DELETE RESTRICT,
  persona_id UUID REFERENCES persona(id) ON DELETE RESTRICT,
  cargado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,4) NOT NULL CHECK (cantidad <> 0),
  costo_unitario_gs NUMERIC(15,4) NOT NULL CHECK (costo_unitario_gs >= 0),
  es_desperdicio BOOLEAN NOT NULL DEFAULT false,
  grupo_id UUID,           -- consumos que nacieron juntos (merma o plancha compartida)
  corrige_id UUID REFERENCES consumo_insumo(id) ON DELETE RESTRICT,
  nota TEXT,
  clave_idempotencia UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_consumo_tarea_ot FOREIGN KEY (tarea_id, orden_trabajo_id) REFERENCES tarea (id, orden_trabajo_id) ON DELETE RESTRICT,
  -- Negativo solo como corrección de otro consumo (con motivo).
  CONSTRAINT chk_consumo_signo CHECK (
    (cantidad > 0 AND corrige_id IS NULL) OR (cantidad < 0 AND corrige_id IS NOT NULL AND btrim(coalesce(nota, '')) <> '')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumo_una_correccion ON consumo_insumo (corrige_id) WHERE corrige_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumo_ot ON consumo_insumo (orden_trabajo_id, created_at);
DROP TRIGGER IF EXISTS trg_consumo_inmutable ON consumo_insumo;
CREATE TRIGGER trg_consumo_inmutable BEFORE UPDATE OR DELETE ON consumo_insumo FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_consumo_no_truncate ON consumo_insumo;
CREATE TRIGGER trg_consumo_no_truncate BEFORE TRUNCATE ON consumo_insumo FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

ALTER TABLE insumo ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_precio ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumo_insumo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON insumo, insumo_precio, consumo_insumo FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON insumo TO afull_api;
GRANT SELECT, INSERT ON insumo_precio, consumo_insumo TO afull_api;
DROP POLICY IF EXISTS api_acceso ON insumo;
CREATE POLICY api_acceso ON insumo FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_lectura ON insumo_precio;
CREATE POLICY api_lectura ON insumo_precio FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insercion ON insumo_precio;
CREATE POLICY api_insercion ON insumo_precio FOR INSERT TO afull_api WITH CHECK (true);
DROP POLICY IF EXISTS api_lectura ON consumo_insumo;
CREATE POLICY api_lectura ON consumo_insumo FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insercion ON consumo_insumo;
CREATE POLICY api_insercion ON consumo_insumo FOR INSERT TO afull_api WITH CHECK (true);
