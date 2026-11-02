-- MIGRACIÓN 0006: TAREAS, CRONÓMETRO Y CONTROL EN VIVO (Loop 2)

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- 1. TARIFAS POR PERSONA (historial con vigencia y sin solapamiento por persona)
CREATE TABLE IF NOT EXISTS tarifa_persona (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES persona(id) ON DELETE RESTRICT,
  tarifa_hora_gs NUMERIC(15,4) NOT NULL CHECK (tarifa_hora_gs > 0),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tarifa_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT uq_tarifa_sin_solapamiento EXCLUDE USING gist (
    persona_id WITH =,
    daterange(fecha_inicio, coalesce(fecha_fin, 'infinity'), '[]') WITH &&
  )
);
CREATE INDEX IF NOT EXISTS idx_tarifa_persona ON tarifa_persona (persona_id);

-- Trigger de inmutabilidad de tarifa_persona
CREATE OR REPLACE FUNCTION fn_tarifa_persona_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.fecha_fin IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede modificar una tarifa con vigencia cerrada' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.persona_id <> OLD.persona_id OR NEW.tarifa_hora_gs <> OLD.tarifa_hora_gs OR NEW.fecha_inicio <> OLD.fecha_inicio OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Solo se permite actualizar la fecha de fin de una tarifa abierta' USING ERRCODE = '23514';
  END IF;
  IF NEW.fecha_fin IS NULL THEN
    RAISE EXCEPTION 'La fecha de fin debe ser informada para cerrar la tarifa' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tarifa_persona_no_delete ON tarifa_persona;
CREATE TRIGGER trg_tarifa_persona_no_delete BEFORE DELETE ON tarifa_persona
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_tarifa_persona_no_truncate ON tarifa_persona;
CREATE TRIGGER trg_tarifa_persona_no_truncate BEFORE TRUNCATE ON tarifa_persona
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_tarifa_persona_update ON tarifa_persona;
CREATE TRIGGER trg_tarifa_persona_update BEFORE UPDATE ON tarifa_persona
  FOR EACH ROW EXECUTE FUNCTION fn_tarifa_persona_update();

-- 2. TAREAS DE ÓRDENES DE TRABAJO
CREATE TABLE IF NOT EXISTS tarea (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE RESTRICT,
  persona_asignada_id UUID REFERENCES persona(id) ON DELETE RESTRICT,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('TALLER_IMPRESION', 'TALLER_CORTE', 'TALLER_HERRERIA', 'TALLER_ARMADO', 'MONTAJE_CALLE', 'OTRO')),
  descripcion TEXT NOT NULL CHECK (btrim(descripcion) <> ''),
  orden_secuencia INT NOT NULL DEFAULT 1,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'EN_CURSO', 'PAUSADA', 'LISTO', 'CANCELADA')),
  creado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarea_ot ON tarea (orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_tarea_persona_estado ON tarea (persona_asignada_id, estado);

DROP TRIGGER IF EXISTS trg_tarea_upd ON tarea;
CREATE TRIGGER trg_tarea_upd BEFORE UPDATE ON tarea
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- 3. HISTORIAL INMUTABLE DE EVENTOS DE TAREA
CREATE TABLE IF NOT EXISTS tarea_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES tarea(id) ON DELETE RESTRICT,
  estado_anterior VARCHAR(30),
  estado_nuevo VARCHAR(30) NOT NULL,
  autor_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tarea_evento_cancelacion CHECK (
    estado_nuevo <> 'CANCELADA' OR btrim(coalesce(comentario, '')) <> ''
  )
);
CREATE INDEX IF NOT EXISTS idx_tarea_evento_tarea ON tarea_evento (tarea_id, created_at);

DROP TRIGGER IF EXISTS trg_tarea_evento_inmutable ON tarea_evento;
CREATE TRIGGER trg_tarea_evento_inmutable BEFORE UPDATE OR DELETE ON tarea_evento
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_tarea_evento_no_truncate ON tarea_evento;
CREATE TRIGGER trg_tarea_evento_no_truncate BEFORE TRUNCATE ON tarea_evento
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- 4. INTERVALOS DE CRONÓMETRO DE TAREA
CREATE TABLE IF NOT EXISTS tarea_intervalo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES tarea(id) ON DELETE RESTRICT,
  persona_id UUID NOT NULL REFERENCES persona(id) ON DELETE RESTRICT,
  hora_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  hora_fin TIMESTAMPTZ,
  motivo_cierre VARCHAR(50) CHECK (
    motivo_cierre IS NULL OR motivo_cierre IN ('PAUSA', 'ALMUERZO', 'FALTA_MATERIAL', 'LLUVIA', 'CAMBIO_TAREA', 'FIN', 'OTRO')
  ),
  clave_idempotencia UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_intervalo_horas CHECK (hora_fin IS NULL OR hora_fin >= hora_inicio)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_intervalo_abierto ON tarea_intervalo (persona_id) WHERE hora_fin IS NULL;
CREATE INDEX IF NOT EXISTS idx_intervalo_tarea ON tarea_intervalo (tarea_id);
CREATE INDEX IF NOT EXISTS idx_intervalo_persona_hora ON tarea_intervalo (persona_id, hora_inicio DESC);

-- Trigger de inmutabilidad de tarea_intervalo
CREATE OR REPLACE FUNCTION fn_tarea_intervalo_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.hora_fin IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede modificar un intervalo de tarea ya cerrado' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tarea_id <> OLD.tarea_id OR NEW.persona_id <> OLD.persona_id OR NEW.hora_inicio <> OLD.hora_inicio OR NEW.clave_idempotencia <> OLD.clave_idempotencia OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Solo se permite actualizar hora_fin y motivo_cierre al cerrar un intervalo' USING ERRCODE = '23514';
  END IF;
  IF NEW.hora_fin IS NULL THEN
    RAISE EXCEPTION 'La hora de fin debe ser informada para cerrar el intervalo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tarea_intervalo_no_delete ON tarea_intervalo;
CREATE TRIGGER trg_tarea_intervalo_no_delete BEFORE DELETE ON tarea_intervalo
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_tarea_intervalo_no_truncate ON tarea_intervalo;
CREATE TRIGGER trg_tarea_intervalo_no_truncate BEFORE TRUNCATE ON tarea_intervalo
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

DROP TRIGGER IF EXISTS trg_tarea_intervalo_update ON tarea_intervalo;
CREATE TRIGGER trg_tarea_intervalo_update BEFORE UPDATE ON tarea_intervalo
  FOR EACH ROW EXECUTE FUNCTION fn_tarea_intervalo_update();

-- 5. RLS Y PERMISOS
ALTER TABLE tarifa_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea_intervalo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tarifa_persona, tarea, tarea_evento, tarea_intervalo FROM anon, authenticated, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON tarifa_persona, tarea, tarea_intervalo TO afull_api;
GRANT SELECT, INSERT ON tarea_evento TO afull_api;

DROP POLICY IF EXISTS api_acceso ON tarifa_persona;
CREATE POLICY api_acceso ON tarifa_persona FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON tarea;
CREATE POLICY api_acceso ON tarea FOR ALL TO afull_api USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_lectura ON tarea_evento;
CREATE POLICY api_lectura ON tarea_evento FOR SELECT TO afull_api USING (true);

DROP POLICY IF EXISTS api_insercion ON tarea_evento;
CREATE POLICY api_insercion ON tarea_evento FOR INSERT TO afull_api WITH CHECK (true);

DROP POLICY IF EXISTS api_acceso ON tarea_intervalo;
CREATE POLICY api_acceso ON tarea_intervalo FOR ALL TO afull_api USING (true) WITH CHECK (true);
