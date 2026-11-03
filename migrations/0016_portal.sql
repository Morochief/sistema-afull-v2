-- MIGRACIÓN 0016: PORTAL DEL CLIENTE Y PEDIDOS (Loop 9)
-- Acceso por enlace sin contraseña: el token (32 bytes) se muestra UNA vez; en la base solo su SHA-256.
-- El cliente carga pedidos por local; Comercial los convierte en OT o presupuesto, o los descarta con motivo.

CREATE TABLE IF NOT EXISTS portal_acceso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  descripcion VARCHAR(150) NOT NULL CHECK (btrim(descripcion) <> ''),
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  activo BOOLEAN NOT NULL DEFAULT true,
  expira_at TIMESTAMPTZ NOT NULL,
  ultimo_uso_at TIMESTAMPTZ,
  creado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_portal_cliente ON portal_acceso (cliente_id, created_at DESC);

-- Un acceso revocado no se reactiva (se genera otro enlace); el token y el cliente no cambian nunca.
CREATE OR REPLACE FUNCTION fn_portal_acceso_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.token_hash <> OLD.token_hash OR NEW.cliente_id <> OLD.cliente_id OR NEW.creado_por <> OLD.creado_por OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'El enlace del portal no se modifica: se revoca y se genera otro' USING ERRCODE = '23514';
  END IF;
  IF NOT OLD.activo AND NEW.activo THEN
    RAISE EXCEPTION 'Un enlace revocado no se reactiva' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_portal_acceso_update ON portal_acceso;
CREATE TRIGGER trg_portal_acceso_update BEFORE UPDATE ON portal_acceso FOR EACH ROW EXECUTE FUNCTION fn_portal_acceso_update();
DROP TRIGGER IF EXISTS trg_portal_acceso_no_delete ON portal_acceso;
CREATE TRIGGER trg_portal_acceso_no_delete BEFORE DELETE ON portal_acceso FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- Para atar el pedido a una OT del MISMO cliente (FK compuesta).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ot_id_cliente') THEN
    ALTER TABLE orden_trabajo ADD CONSTRAINT uq_ot_id_cliente UNIQUE (id, cliente_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero VARCHAR(20) NOT NULL UNIQUE,
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  sucursal_id UUID,
  descripcion TEXT NOT NULL CHECK (length(btrim(descripcion)) >= 5),
  foto_url TEXT CHECK (foto_url IS NULL OR foto_url LIKE 'https://%'),
  portal_acceso_id UUID REFERENCES portal_acceso(id) ON DELETE RESTRICT,
  estado VARCHAR(20) NOT NULL DEFAULT 'NUEVO' CHECK (estado IN ('NUEVO', 'CONVERTIDO', 'DESCARTADO')),
  orden_trabajo_id UUID,
  presupuesto_id UUID,
  motivo_descarte TEXT,
  resuelto_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  resuelto_at TIMESTAMPTZ,
  clave_idempotencia UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_pedido_sucursal_del_cliente FOREIGN KEY (sucursal_id, cliente_id) REFERENCES sucursal (id, cliente_id) ON DELETE RESTRICT,
  CONSTRAINT fk_pedido_ot_del_cliente FOREIGN KEY (orden_trabajo_id, cliente_id) REFERENCES orden_trabajo (id, cliente_id) ON DELETE RESTRICT,
  CONSTRAINT fk_pedido_presupuesto_del_cliente FOREIGN KEY (presupuesto_id, cliente_id) REFERENCES presupuesto (id, cliente_id) ON DELETE RESTRICT,
  CONSTRAINT chk_pedido_resolucion CHECK (
    (estado = 'NUEVO' AND orden_trabajo_id IS NULL AND presupuesto_id IS NULL AND motivo_descarte IS NULL AND resuelto_por IS NULL)
    OR (estado = 'CONVERTIDO' AND num_nonnulls(orden_trabajo_id, presupuesto_id) = 1 AND motivo_descarte IS NULL AND resuelto_por IS NOT NULL)
    OR (estado = 'DESCARTADO' AND orden_trabajo_id IS NULL AND presupuesto_id IS NULL AND btrim(coalesce(motivo_descarte, '')) <> '' AND resuelto_por IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pedido_cliente ON pedido (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedido_estado ON pedido (estado, created_at DESC);

-- Se resuelve UNA vez (NUEVO → CONVERTIDO o DESCARTADO); lo que cargó el cliente no se toca.
CREATE OR REPLACE FUNCTION fn_pedido_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado <> 'NUEVO' THEN
    RAISE EXCEPTION 'El pedido ya fue resuelto' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - 'estado' - 'orden_trabajo_id' - 'presupuesto_id' - 'motivo_descarte' - 'resuelto_por' - 'resuelto_at' - 'updated_at')
     <> (to_jsonb(OLD) - 'estado' - 'orden_trabajo_id' - 'presupuesto_id' - 'motivo_descarte' - 'resuelto_por' - 'resuelto_at' - 'updated_at') THEN
    RAISE EXCEPTION 'Lo que cargó el cliente no se modifica' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.resuelto_at := clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pedido_update ON pedido;
CREATE TRIGGER trg_pedido_update BEFORE UPDATE ON pedido FOR EACH ROW EXECUTE FUNCTION fn_pedido_update();
DROP TRIGGER IF EXISTS trg_pedido_no_delete ON pedido;
CREATE TRIGGER trg_pedido_no_delete BEFORE DELETE ON pedido FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_pedido_no_truncate ON pedido;
CREATE TRIGGER trg_pedido_no_truncate BEFORE TRUNCATE ON pedido FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

ALTER TABLE portal_acceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal_acceso, pedido FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON portal_acceso, pedido TO afull_api;
DROP POLICY IF EXISTS api_acceso ON portal_acceso;
CREATE POLICY api_acceso ON portal_acceso FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_acceso ON pedido;
CREATE POLICY api_acceso ON pedido FOR ALL TO afull_api USING (true) WITH CHECK (true);
