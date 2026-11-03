-- MIGRACIÓN 0012 (Claude Code, 2026-11-03), por las planillas reales de la empresa y decisiones del usuario.

-- A) CATÁLOGO DE PROCESOS: el tipo de tarea deja de ser una lista fija; Juan (admin) agrega los que hagan falta.
--    Nada se borra: un proceso en desuso se desactiva y las horas viejas siguen apuntando a él.
CREATE TABLE IF NOT EXISTS tipo_tarea (
  codigo VARCHAR(40) PRIMARY KEY CHECK (codigo ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  nombre VARCHAR(60) NOT NULL CHECK (btrim(nombre) <> ''),
  area VARCHAR(20) NOT NULL CHECK (area IN ('TALLER', 'CALLE', 'DISENO', 'COMERCIAL', 'OTRO')),
  orden INT NOT NULL DEFAULT 100,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_tarea_nombre ON tipo_tarea (lower(nombre));
DROP TRIGGER IF EXISTS trg_tipo_tarea_upd ON tipo_tarea;
CREATE TRIGGER trg_tipo_tarea_upd BEFORE UPDATE ON tipo_tarea FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- Los 7 que ya existían (mismo código) + los procesos más usados en las planillas de proyectos.
INSERT INTO tipo_tarea (codigo, nombre, area, orden) VALUES
  ('DISENO', 'Diseño', 'DISENO', 10),
  ('PRESUPUESTO', 'Presupuesto', 'COMERCIAL', 20),
  ('RELEVAMIENTO', 'Relevamiento / medición', 'COMERCIAL', 21),
  ('COMPRA', 'Compra de materiales', 'COMERCIAL', 22),
  ('TALLER_IMPRESION', 'Impresión', 'TALLER', 30),
  ('PLOTEO', 'Ploteo', 'TALLER', 31),
  ('TALLER_CORTE', 'Corte', 'TALLER', 32),
  ('REFILADO', 'Refilado', 'TALLER', 33),
  ('PREPARACION', 'Preparación', 'TALLER', 34),
  ('FABRICACION', 'Fabricación', 'TALLER', 35),
  ('TALLER_HERRERIA', 'Herrería', 'TALLER', 36),
  ('CARPINTERIA', 'Carpintería', 'TALLER', 37),
  ('TALLER_ARMADO', 'Armado', 'TALLER', 38),
  ('LIJADO', 'Lijado', 'TALLER', 39),
  ('PINTURA', 'Pintura', 'TALLER', 40),
  ('ELECTRICIDAD', 'Electricidad', 'TALLER', 41),
  ('ENFILADO', 'Enfilado', 'TALLER', 42),
  ('TENSADO', 'Tensado', 'TALLER', 43),
  ('CONTROL', 'Control de calidad', 'TALLER', 44),
  ('LIMPIEZA', 'Limpieza', 'TALLER', 45),
  ('CARGA_DESCARGA', 'Carga / descarga', 'CALLE', 50),
  ('RETIRO', 'Retiro', 'CALLE', 51),
  ('ENTREGA', 'Entrega', 'CALLE', 52),
  ('MONTAJE_CALLE', 'Montaje / colocación', 'CALLE', 53),
  ('REPARACION', 'Reparación', 'CALLE', 54),
  ('OTRO', 'Otro', 'OTRO', 999)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE tarea DROP CONSTRAINT IF EXISTS tarea_tipo_check;
ALTER TABLE tarea DROP CONSTRAINT IF EXISTS fk_tarea_tipo;
ALTER TABLE tarea ADD CONSTRAINT fk_tarea_tipo FOREIGN KEY (tipo) REFERENCES tipo_tarea (codigo) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE tipo_tarea ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tipo_tarea FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tipo_tarea TO afull_api;
DROP POLICY IF EXISTS api_acceso ON tipo_tarea;
CREATE POLICY api_acceso ON tipo_tarea FOR ALL TO afull_api USING (true) WITH CHECK (true);

-- B) PRECIO: margen SOBRE LA VENTA (precio = costo ÷ (1 − margen)), como en las planillas (costo ÷ 0,70).
--    El margen tiene que ser menor a 100 %. Se puede fijar un precio final redondeado a mano.
ALTER TABLE presupuesto ALTER COLUMN margen_pct SET DEFAULT 30.00;
ALTER TABLE presupuesto DROP CONSTRAINT IF EXISTS chk_presupuesto_margen_venta;
ALTER TABLE presupuesto ADD CONSTRAINT chk_presupuesto_margen_venta CHECK (margen_pct < 100);
ALTER TABLE presupuesto ADD COLUMN IF NOT EXISTS precio_final_gs BIGINT CHECK (precio_final_gs IS NULL OR precio_final_gs > 0);

CREATE OR REPLACE FUNCTION fn_presupuesto_congelado()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IN ('APROBADO', 'RECHAZADO', 'REEMPLAZADO', 'ANULADO') THEN
    RAISE EXCEPTION 'El presupuesto está en estado final (%) y no se puede modificar', OLD.estado USING ERRCODE = '23514';
  END IF;
  IF OLD.estado <> 'BORRADOR' AND (
       NEW.numero IS DISTINCT FROM OLD.numero OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.titulo IS DISTINCT FROM OLD.titulo
    OR NEW.notas IS DISTINCT FROM OLD.notas OR NEW.margen_pct IS DISTINCT FROM OLD.margen_pct
    OR NEW.validez_dias IS DISTINCT FROM OLD.validez_dias OR NEW.total_gs IS DISTINCT FROM OLD.total_gs
    OR NEW.iva_gs IS DISTINCT FROM OLD.iva_gs OR NEW.precio_final_gs IS DISTINCT FROM OLD.precio_final_gs
    OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
    OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Presupuesto %: fuera de BORRADOR solo puede cambiar de estado', OLD.estado USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
