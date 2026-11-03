-- MIGRACIÓN 0007: CIRCUITO COMERCIAL (PRESUPUESTOS Y PROYECTOS - Loop 3)

-- 1. PROYECTO (carpeta contenedora de OTs para campañas multi-local o trabajos agrupados)
CREATE TABLE IF NOT EXISTS proyecto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) NOT NULL,
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  nombre VARCHAR(255) NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion TEXT,
  estado VARCHAR(30) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'CERRADO', 'CANCELADO')),
  creado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_proyecto_codigo UNIQUE (codigo),
  CONSTRAINT uq_proyecto_id_cliente UNIQUE (id, cliente_id)
);
CREATE INDEX IF NOT EXISTS idx_proyecto_cliente ON proyecto (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proyecto_estado ON proyecto (estado);

DROP TRIGGER IF EXISTS trg_proyecto_upd ON proyecto;
CREATE TRIGGER trg_proyecto_upd BEFORE UPDATE ON proyecto
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- 2. PRESUPUESTO
CREATE TABLE IF NOT EXISTS presupuesto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero VARCHAR(50) NOT NULL,
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  titulo VARCHAR(255) NOT NULL CHECK (btrim(titulo) <> ''),
  notas TEXT,
  margen_pct NUMERIC(5,2) NOT NULL DEFAULT 35.00 CHECK (margen_pct >= 0),
  validez_dias INT NOT NULL DEFAULT 15 CHECK (validez_dias >= 1),
  estado VARCHAR(30) NOT NULL DEFAULT 'BORRADOR'
    CHECK (estado IN ('BORRADOR', 'ENVIADO', 'APROBADO', 'RECHAZADO', 'REEMPLAZADO', 'ANULADO')),
  total_gs BIGINT CHECK (estado = 'BORRADOR' OR total_gs IS NOT NULL),
  enviado_at TIMESTAMPTZ,
  creado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_presupuesto_numero_version UNIQUE (numero, version),
  CONSTRAINT uq_presupuesto_id_cliente UNIQUE (id, cliente_id)
);
-- Índice único parcial: una sola versión viva por número de presupuesto
CREATE UNIQUE INDEX IF NOT EXISTS uq_presupuesto_version_viva ON presupuesto (numero)
  WHERE estado IN ('BORRADOR', 'ENVIADO', 'APROBADO');
CREATE INDEX IF NOT EXISTS idx_presupuesto_cliente ON presupuesto (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presupuesto_estado ON presupuesto (estado);

DROP TRIGGER IF EXISTS trg_presupuesto_upd ON presupuesto;
CREATE TRIGGER trg_presupuesto_upd BEFORE UPDATE ON presupuesto
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- 3. PRESUPUESTO_ITEM
CREATE TABLE IF NOT EXISTS presupuesto_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id UUID NOT NULL,
  cliente_id UUID NOT NULL,
  sucursal_id UUID,
  orden INT NOT NULL DEFAULT 0,
  concepto VARCHAR(50) NOT NULL CHECK (concepto IN ('MATERIAL', 'MANO_DE_OBRA', 'TERCERIZADO', 'MOVILIDAD', 'OTRO')),
  descripcion TEXT NOT NULL CHECK (btrim(descripcion) <> ''),
  cantidad NUMERIC(12,4) NOT NULL CHECK (cantidad > 0),
  unidad VARCHAR(20) NOT NULL DEFAULT 'UNIDAD',
  precio_unitario_gs NUMERIC(15,4) NOT NULL CHECK (precio_unitario_gs >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_item_presupuesto_cliente FOREIGN KEY (presupuesto_id, cliente_id)
    REFERENCES presupuesto (id, cliente_id) ON DELETE RESTRICT,
  CONSTRAINT fk_item_sucursal_cliente FOREIGN KEY (sucursal_id, cliente_id)
    REFERENCES sucursal (id, cliente_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_item_presupuesto ON presupuesto_item (presupuesto_id, orden);

DROP TRIGGER IF EXISTS trg_presupuesto_item_upd ON presupuesto_item;
CREATE TRIGGER trg_presupuesto_item_upd BEFORE UPDATE ON presupuesto_item
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- Trigger congelamiento de ítems no borrador y anti-delete
CREATE OR REPLACE FUNCTION fn_presupuesto_item_solo_borrador()
RETURNS TRIGGER AS $$
DECLARE
  v_estado VARCHAR(30);
BEGIN
  SELECT estado INTO v_estado FROM presupuesto WHERE id = NEW.presupuesto_id;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Presupuesto no encontrado' USING ERRCODE = '23503';
  END IF;
  IF v_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'No se pueden agregar o modificar ítems de un presupuesto que no está en BORRADOR (estado actual: %)', v_estado USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presupuesto_item_solo_borrador ON presupuesto_item;
CREATE TRIGGER trg_presupuesto_item_solo_borrador BEFORE INSERT OR UPDATE ON presupuesto_item
  FOR EACH ROW EXECUTE FUNCTION fn_presupuesto_item_solo_borrador();

DROP TRIGGER IF EXISTS trg_presupuesto_item_no_delete ON presupuesto_item;
CREATE TRIGGER trg_presupuesto_item_no_delete BEFORE DELETE ON presupuesto_item
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_presupuesto_item_no_truncate ON presupuesto_item;
CREATE TRIGGER trg_presupuesto_item_no_truncate BEFORE TRUNCATE ON presupuesto_item
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- 4. PRESUPUESTO_EVENTO (inmutable)
CREATE TABLE IF NOT EXISTS presupuesto_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id UUID NOT NULL REFERENCES presupuesto(id) ON DELETE RESTRICT,
  estado_anterior VARCHAR(30),
  estado_nuevo VARCHAR(30) NOT NULL,
  autor_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_presupuesto_evento_comentario CHECK (
    estado_nuevo NOT IN ('APROBADO', 'RECHAZADO', 'ANULADO') OR (comentario IS NOT NULL AND btrim(comentario) <> '')
  )
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_evento ON presupuesto_evento (presupuesto_id, created_at);

DROP TRIGGER IF EXISTS trg_presupuesto_evento_inmutable ON presupuesto_evento;
CREATE TRIGGER trg_presupuesto_evento_inmutable BEFORE UPDATE OR DELETE ON presupuesto_evento
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_presupuesto_evento_no_truncate ON presupuesto_evento;
CREATE TRIGGER trg_presupuesto_evento_no_truncate BEFORE TRUNCATE ON presupuesto_evento
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- 5. ALTER ORDEN_TRABAJO
ALTER TABLE orden_trabajo
  ADD COLUMN IF NOT EXISTS presupuesto_id UUID,
  ADD COLUMN IF NOT EXISTS proyecto_id UUID,
  ADD COLUMN IF NOT EXISTS monto_presupuestado_gs BIGINT CHECK (monto_presupuestado_gs IS NULL OR monto_presupuestado_gs >= 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ot_presupuesto_cliente'
  ) THEN
    ALTER TABLE orden_trabajo
      ADD CONSTRAINT fk_ot_presupuesto_cliente
      FOREIGN KEY (presupuesto_id, cliente_id)
      REFERENCES presupuesto (id, cliente_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ot_proyecto_cliente'
  ) THEN
    ALTER TABLE orden_trabajo
      ADD CONSTRAINT fk_ot_proyecto_cliente
      FOREIGN KEY (proyecto_id, cliente_id)
      REFERENCES proyecto (id, cliente_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ot_presupuesto ON orden_trabajo (presupuesto_id);
CREATE INDEX IF NOT EXISTS idx_ot_proyecto ON orden_trabajo (proyecto_id);

CREATE OR REPLACE FUNCTION fn_ot_presupuesto_inmutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.presupuesto_id IS NOT NULL AND NEW.presupuesto_id <> OLD.presupuesto_id THEN
    RAISE EXCEPTION 'No se puede modificar el presupuesto_id de una OT una vez asignado' USING ERRCODE = '23514';
  END IF;
  IF OLD.monto_presupuestado_gs IS NOT NULL AND NEW.monto_presupuestado_gs <> OLD.monto_presupuestado_gs THEN
    RAISE EXCEPTION 'No se puede modificar el monto_presupuestado_gs de una OT una vez asignado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ot_presupuesto_inmutable ON orden_trabajo;
CREATE TRIGGER trg_ot_presupuesto_inmutable BEFORE UPDATE ON orden_trabajo
  FOR EACH ROW EXECUTE FUNCTION fn_ot_presupuesto_inmutable();

-- 6. RLS Y PERMISOS
ALTER TABLE proyecto ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_evento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON proyecto, presupuesto, presupuesto_item, presupuesto_evento FROM anon, authenticated, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON proyecto, presupuesto, presupuesto_item TO afull_api;
GRANT SELECT, INSERT ON presupuesto_evento TO afull_api;

DROP POLICY IF EXISTS api_acceso ON proyecto;
CREATE POLICY api_acceso ON proyecto FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON presupuesto;
CREATE POLICY api_acceso ON presupuesto FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON presupuesto_item;
CREATE POLICY api_acceso ON presupuesto_item FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_lectura ON presupuesto_evento;
CREATE POLICY api_lectura ON presupuesto_evento FOR SELECT TO afull_api USING (true);

DROP POLICY IF EXISTS api_insercion ON presupuesto_evento;
CREATE POLICY api_insercion ON presupuesto_evento FOR INSERT TO afull_api WITH CHECK (true);
