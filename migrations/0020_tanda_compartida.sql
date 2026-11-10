-- Loop 12: horas de máquina compartidas (docs/LOOP_12_HORAS_COMPARTIDAS_DISENO.md).
-- Una tanda agrupa tareas de OTs distintas; sus tramos corren sobre la tarea principal y el costo se reparte por m².
CREATE TABLE IF NOT EXISTS tanda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES persona(id) ON DELETE RESTRICT,
  tarea_principal_id UUID NOT NULL REFERENCES tarea(id) ON DELETE RESTRICT,
  creada_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  clave_idempotencia UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tanda_tarea (
  tanda_id UUID NOT NULL REFERENCES tanda(id) ON DELETE RESTRICT,
  tarea_id UUID NOT NULL REFERENCES tarea(id) ON DELETE RESTRICT,
  m2_piezas NUMERIC(12,4) NOT NULL CHECK (m2_piezas > 0),
  orden SMALLINT NOT NULL CHECK (orden >= 1),
  PRIMARY KEY (tanda_id, tarea_id)
);
CREATE INDEX IF NOT EXISTS idx_tanda_tarea_tarea ON tanda_tarea (tarea_id);
CREATE INDEX IF NOT EXISTS idx_tanda_principal ON tanda (tarea_principal_id);

DROP TRIGGER IF EXISTS trg_tanda_inmutable ON tanda;
CREATE TRIGGER trg_tanda_inmutable BEFORE UPDATE OR DELETE ON tanda FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_tanda_no_truncate ON tanda;
CREATE TRIGGER trg_tanda_no_truncate BEFORE TRUNCATE ON tanda FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_tanda_tarea_inmutable ON tanda_tarea;
CREATE TRIGGER trg_tanda_tarea_inmutable BEFORE UPDATE OR DELETE ON tanda_tarea FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_tanda_tarea_no_truncate ON tanda_tarea;
CREATE TRIGGER trg_tanda_tarea_no_truncate BEFORE TRUNCATE ON tanda_tarea FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- El tramo apunta a su tanda; no se puede cambiar después.
ALTER TABLE tarea_intervalo ADD COLUMN IF NOT EXISTS tanda_id UUID REFERENCES tanda(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_intervalo_tanda ON tarea_intervalo (tanda_id) WHERE tanda_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_tarea_intervalo_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.hora_fin IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede modificar un intervalo de tarea ya cerrado' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tarea_id <> OLD.tarea_id OR NEW.persona_id <> OLD.persona_id OR NEW.hora_inicio <> OLD.hora_inicio
     OR NEW.clave_idempotencia <> OLD.clave_idempotencia OR NEW.created_at <> OLD.created_at
     OR NEW.tanda_id IS DISTINCT FROM OLD.tanda_id THEN
    RAISE EXCEPTION 'Solo se permite actualizar hora_fin y motivo_cierre al cerrar un intervalo' USING ERRCODE = '23514';
  END IF;
  IF NEW.hora_fin IS NULL THEN
    RAISE EXCEPTION 'La hora de fin debe ser informada para cerrar el intervalo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Mano de obra imputada: una fila por tramo cerrado y tarea. Sin tanda, peso = peso_total = 1.
-- Con tanda, una fila por tarea de la tanda con su m² y el total de la tanda: costo = segundos × peso / peso_total.
CREATE OR REPLACE VIEW v_mano_obra WITH (security_invoker = true) AS
SELECT i.id AS intervalo_id, i.persona_id, i.hora_inicio, i.tanda_id,
       coalesce(tt.tarea_id, i.tarea_id) AS tarea_id, t.orden_trabajo_id,
       extract(epoch FROM i.hora_fin - i.hora_inicio) AS segundos,
       coalesce(tt.m2_piezas, 1) AS peso,
       coalesce((SELECT sum(x.m2_piezas) FROM tanda_tarea x WHERE x.tanda_id = i.tanda_id), 1) AS peso_total
FROM tarea_intervalo i
LEFT JOIN tanda_tarea tt ON tt.tanda_id = i.tanda_id
JOIN tarea t ON t.id = coalesce(tt.tarea_id, i.tarea_id)
WHERE i.hora_fin IS NOT NULL;

ALTER TABLE tanda ENABLE ROW LEVEL SECURITY;
ALTER TABLE tanda_tarea ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON tanda, tanda_tarea TO afull_api;
GRANT SELECT ON v_mano_obra TO afull_api;
REVOKE ALL ON tanda, tanda_tarea, v_mano_obra FROM anon, authenticated;
DROP POLICY IF EXISTS api_select ON tanda;
CREATE POLICY api_select ON tanda FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insert ON tanda;
CREATE POLICY api_insert ON tanda FOR INSERT TO afull_api WITH CHECK (true);
DROP POLICY IF EXISTS api_select ON tanda_tarea;
CREATE POLICY api_select ON tanda_tarea FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insert ON tanda_tarea;
CREATE POLICY api_insert ON tanda_tarea FOR INSERT TO afull_api WITH CHECK (true);
