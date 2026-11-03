-- MIGRACIÓN 0014: COSTEO REAL POR OT (Loop 6)
-- Snapshot inmutable que se genera EN LA MISMA TRANSACCIÓN en que la OT pasa a TERMINADO o CANCELADO.
-- Es el único lugar donde se redondea (principio 6): cada componente se redondea una vez a guaraníes enteros.

CREATE TABLE IF NOT EXISTS ot_costeo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID NOT NULL UNIQUE REFERENCES orden_trabajo(id) ON DELETE RESTRICT,
  estado_final VARCHAR(20) NOT NULL CHECK (estado_final IN ('TERMINADO', 'CANCELADO')),
  horas NUMERIC(12,4) NOT NULL CHECK (horas >= 0),
  mano_obra_gs BIGINT NOT NULL CHECK (mano_obra_gs >= 0),
  material_gs BIGINT NOT NULL,
  desperdicio_gs BIGINT NOT NULL,
  km NUMERIC(10,1) NOT NULL CHECK (km >= 0),
  km_gs BIGINT NOT NULL CHECK (km_gs >= 0),
  -- total = suma de los componentes ya redondeados (así la pantalla siempre suma).
  total_gs BIGINT NOT NULL,
  monto_presupuestado_gs BIGINT CHECK (monto_presupuestado_gs IS NULL OR monto_presupuestado_gs >= 0),
  -- Margen sobre la venta, como en el presupuesto: (venta − costo) ÷ venta. NULL si la OT no tiene monto.
  margen_pct NUMERIC(15,2),
  -- Detalle por persona y proceso, viajes y alertas (horas sin tarifa, etc.): para mostrar, no para calcular.
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  generado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_costeo_total CHECK (total_gs = mano_obra_gs + material_gs + km_gs),
  CONSTRAINT chk_costeo_margen CHECK ((monto_presupuestado_gs IS NULL OR monto_presupuestado_gs = 0) = (margen_pct IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_ot_costeo_fecha ON ot_costeo (created_at DESC);

DROP TRIGGER IF EXISTS trg_ot_costeo_inmutable ON ot_costeo;
CREATE TRIGGER trg_ot_costeo_inmutable BEFORE UPDATE OR DELETE ON ot_costeo FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_ot_costeo_no_truncate ON ot_costeo;
CREATE TRIGGER trg_ot_costeo_no_truncate BEFORE TRUNCATE ON ot_costeo FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- Para buscar la tarifa vigente de cada intervalo y los viajes de cada hoja.
CREATE INDEX IF NOT EXISTS idx_viaje_hoja ON viaje (hoja_ruta_id) WHERE hoja_ruta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parada_ot ON hoja_ruta_parada (orden_trabajo_id);

ALTER TABLE ot_costeo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ot_costeo FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON ot_costeo TO afull_api;
DROP POLICY IF EXISTS api_lectura ON ot_costeo;
CREATE POLICY api_lectura ON ot_costeo FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insercion ON ot_costeo;
CREATE POLICY api_insercion ON ot_costeo FOR INSERT TO afull_api WITH CHECK (true);
