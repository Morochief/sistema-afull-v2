-- Loop 13: corregir y cargar horas a mano (docs/LOOP_13_CORREGIR_HORAS_DISENO.md).
-- Las horas siguen siendo eventos inmutables: no se edita un tramo cerrado; se agrega una corrección o un tramo a mano.

-- 1. Tramo cargado a mano (trabajó sin celular) y cierre de un reloj olvidado por la oficina.
ALTER TABLE tarea_intervalo
  ADD COLUMN IF NOT EXISTS origen VARCHAR(10) NOT NULL DEFAULT 'RELOJ' CHECK (origen IN ('RELOJ', 'MANUAL')),
  ADD COLUMN IF NOT EXISTS cargado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS motivo_manual TEXT CHECK (motivo_manual IS NULL OR char_length(motivo_manual) <= 500),
  ADD COLUMN IF NOT EXISTS cerrado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS motivo_correccion TEXT CHECK (motivo_correccion IS NULL OR char_length(motivo_correccion) <= 500);
ALTER TABLE tarea_intervalo DROP CONSTRAINT IF EXISTS chk_intervalo_origen;
ALTER TABLE tarea_intervalo ADD CONSTRAINT chk_intervalo_origen CHECK (
  (origen = 'RELOJ' AND cargado_por IS NULL AND motivo_manual IS NULL)
  OR (origen = 'MANUAL' AND hora_fin IS NOT NULL AND hora_fin > hora_inicio AND cargado_por IS NOT NULL AND btrim(coalesce(motivo_manual, '')) <> '')
);
ALTER TABLE tarea_intervalo DROP CONSTRAINT IF EXISTS chk_intervalo_cierre_oficina;
ALTER TABLE tarea_intervalo ADD CONSTRAINT chk_intervalo_cierre_oficina CHECK (
  (cerrado_por IS NULL AND motivo_correccion IS NULL)
  OR (cerrado_por IS NOT NULL AND motivo_cierre = 'CORRECCION' AND btrim(coalesce(motivo_correccion, '')) <> '')
);
ALTER TABLE tarea_intervalo DROP CONSTRAINT IF EXISTS tarea_intervalo_motivo_cierre_check;
ALTER TABLE tarea_intervalo ADD CONSTRAINT tarea_intervalo_motivo_cierre_check CHECK (
  motivo_cierre IS NULL OR motivo_cierre IN ('PAUSA', 'ALMUERZO', 'FALTA_MATERIAL', 'LLUVIA', 'CAMBIO_TAREA', 'FIN', 'OTRO', 'CORRECCION')
);

-- Al cerrar se pueden informar además quién y por qué (cierre de la oficina); lo demás no cambia (Loops 2 y 12).
CREATE OR REPLACE FUNCTION fn_tarea_intervalo_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.hora_fin IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede modificar un intervalo de tarea ya cerrado' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tarea_id <> OLD.tarea_id OR NEW.persona_id <> OLD.persona_id OR NEW.hora_inicio <> OLD.hora_inicio
     OR NEW.clave_idempotencia <> OLD.clave_idempotencia OR NEW.created_at <> OLD.created_at
     OR NEW.tanda_id IS DISTINCT FROM OLD.tanda_id OR NEW.origen <> OLD.origen
     OR NEW.cargado_por IS DISTINCT FROM OLD.cargado_por OR NEW.motivo_manual IS DISTINCT FROM OLD.motivo_manual THEN
    RAISE EXCEPTION 'Solo se permite actualizar hora_fin y motivo_cierre al cerrar un intervalo' USING ERRCODE = '23514';
  END IF;
  IF NEW.hora_fin IS NULL THEN
    RAISE EXCEPTION 'La hora de fin debe ser informada para cerrar el intervalo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Corrección del fin de un tramo cerrado (solo acortar), una por tramo, inmutable.
CREATE TABLE IF NOT EXISTS intervalo_correccion (
  intervalo_id UUID PRIMARY KEY REFERENCES tarea_intervalo(id) ON DELETE RESTRICT,
  hora_fin_corregida TIMESTAMPTZ NOT NULL,
  motivo TEXT NOT NULL CHECK (btrim(motivo) <> '' AND char_length(motivo) <= 500),
  corregido_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION fn_intervalo_correccion_valida()
RETURNS TRIGGER AS $$
DECLARE i RECORD;
BEGIN
  SELECT hora_inicio, hora_fin INTO i FROM tarea_intervalo WHERE id = NEW.intervalo_id;
  IF i.hora_fin IS NULL OR NEW.hora_fin_corregida < i.hora_inicio OR NEW.hora_fin_corregida >= i.hora_fin THEN
    RAISE EXCEPTION 'La corrección solo puede acortar un tramo cerrado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_intervalo_correccion_valida ON intervalo_correccion;
CREATE TRIGGER trg_intervalo_correccion_valida BEFORE INSERT ON intervalo_correccion FOR EACH ROW EXECUTE FUNCTION fn_intervalo_correccion_valida();
DROP TRIGGER IF EXISTS trg_intervalo_correccion_inmutable ON intervalo_correccion;
CREATE TRIGGER trg_intervalo_correccion_inmutable BEFORE UPDATE OR DELETE ON intervalo_correccion FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_intervalo_correccion_no_truncate ON intervalo_correccion;
CREATE TRIGGER trg_intervalo_correccion_no_truncate BEFORE TRUNCATE ON intervalo_correccion FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- 3. v_tramo: los tramos con la hora de fin EFECTIVA (corregida si hay corrección). Toda consulta de tiempo lee de acá.
CREATE OR REPLACE VIEW v_tramo WITH (security_invoker = true) AS
SELECT i.id, i.tarea_id, i.persona_id, i.hora_inicio,
       coalesce(c.hora_fin_corregida, i.hora_fin) AS hora_fin,
       i.hora_fin AS hora_fin_original, i.motivo_cierre, i.tanda_id, i.origen, i.cargado_por, i.motivo_manual,
       i.cerrado_por, i.motivo_correccion, c.motivo AS motivo_corregido, c.corregido_por, c.created_at AS corregido_at
FROM tarea_intervalo i
LEFT JOIN intervalo_correccion c ON c.intervalo_id = i.id;

-- v_mano_obra (Loop 12) pasa a usar la hora efectiva.
CREATE OR REPLACE VIEW v_mano_obra WITH (security_invoker = true) AS
SELECT i.id AS intervalo_id, i.persona_id, i.hora_inicio, i.tanda_id,
       coalesce(tt.tarea_id, i.tarea_id) AS tarea_id, t.orden_trabajo_id,
       extract(epoch FROM i.hora_fin - i.hora_inicio) AS segundos,
       coalesce(tt.m2_piezas, 1) AS peso,
       coalesce((SELECT sum(x.m2_piezas) FROM tanda_tarea x WHERE x.tanda_id = i.tanda_id), 1) AS peso_total
FROM v_tramo i
LEFT JOIN tanda_tarea tt ON tt.tanda_id = i.tanda_id
JOIN tarea t ON t.id = coalesce(tt.tarea_id, i.tarea_id)
WHERE i.hora_fin IS NOT NULL;

ALTER TABLE intervalo_correccion ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON intervalo_correccion TO afull_api;
GRANT SELECT ON v_tramo, v_mano_obra TO afull_api;
REVOKE ALL ON intervalo_correccion, v_tramo FROM anon, authenticated;
DROP POLICY IF EXISTS api_select ON intervalo_correccion;
CREATE POLICY api_select ON intervalo_correccion FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insert ON intervalo_correccion;
CREATE POLICY api_insert ON intervalo_correccion FOR INSERT TO afull_api WITH CHECK (true);
