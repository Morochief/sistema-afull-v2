-- MIGRACIÓN 0015: SOLICITUDES DE PERMISO (Loop 8, RR.HH.)
-- Sigue el formulario de la empresa: tipo legal, motivo, por horas o por días, comprobante,
-- firma del jefe inmediato (AUTORIZADA) y de RR.HH. (REGISTRADA, con descuento sí/no).

CREATE TABLE IF NOT EXISTS solicitud_permiso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero VARCHAR(20) NOT NULL UNIQUE,
  persona_id UUID NOT NULL REFERENCES persona(id) ON DELETE RESTRICT,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
    'RETIRO_ANTICIPADO', 'LLEGADA_TARDE', 'ESTUDIO', 'SALUD', 'NACIMIENTO', 'MATRIMONIO',
    'FALLECIMIENTO_FAMILIAR', 'DEFUNCION', 'MATERNIDAD_LACTANCIA', 'OBLIGACION_LEGAL', 'OTRO'
  )),
  detalle_tipo VARCHAR(200),
  motivo TEXT NOT NULL CHECK (length(btrim(motivo)) >= 5),
  modalidad VARCHAR(10) NOT NULL CHECK (modalidad IN ('HORAS', 'DIAS')),
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  hora_desde TIME,
  hora_hasta TIME,
  comprobante_url TEXT CHECK (comprobante_url IS NULL OR comprobante_url LIKE 'https://%'),
  fuera_de_plazo BOOLEAN NOT NULL DEFAULT false,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'AUTORIZADA', 'REGISTRADA', 'RECHAZADA', 'ANULADA')),
  con_descuento BOOLEAN,
  cargado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  clave_idempotencia UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_permiso_aclarar CHECK (tipo NOT IN ('OTRO', 'SALUD') OR btrim(coalesce(detalle_tipo, '')) <> ''),
  CONSTRAINT chk_permiso_horas CHECK (
    (modalidad = 'HORAS' AND fecha_hasta = fecha_desde AND hora_desde IS NOT NULL AND hora_hasta IS NOT NULL AND hora_hasta > hora_desde)
    OR (modalidad = 'DIAS' AND fecha_hasta >= fecha_desde AND hora_desde IS NULL AND hora_hasta IS NULL)
  ),
  -- El descuento lo decide RR.HH. al registrar; antes no existe.
  CONSTRAINT chk_permiso_descuento CHECK ((estado = 'REGISTRADA') = (con_descuento IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_permiso_persona ON solicitud_permiso (persona_id, fecha_desde DESC);
CREATE INDEX IF NOT EXISTS idx_permiso_estado ON solicitud_permiso (estado, created_at DESC);

-- Lo cargado no se toca: solo cambian estado, descuento y updated_at, y nunca desde un estado final.
CREATE OR REPLACE FUNCTION fn_permiso_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IN ('REGISTRADA', 'RECHAZADA', 'ANULADA') THEN
    RAISE EXCEPTION 'La solicitud ya está cerrada' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - 'estado' - 'con_descuento' - 'updated_at') <> (to_jsonb(OLD) - 'estado' - 'con_descuento' - 'updated_at') THEN
    RAISE EXCEPTION 'Solo se puede cambiar el estado de una solicitud' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_permiso_update ON solicitud_permiso;
CREATE TRIGGER trg_permiso_update BEFORE UPDATE ON solicitud_permiso FOR EACH ROW EXECUTE FUNCTION fn_permiso_update();
DROP TRIGGER IF EXISTS trg_permiso_no_delete ON solicitud_permiso;
CREATE TRIGGER trg_permiso_no_delete BEFORE DELETE ON solicitud_permiso FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_permiso_no_truncate ON solicitud_permiso;
CREATE TRIGGER trg_permiso_no_truncate BEFORE TRUNCATE ON solicitud_permiso FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- Historial inmutable: las "firmas" (quién autorizó, registró, rechazó o anuló, y cuándo).
CREATE TABLE IF NOT EXISTS solicitud_permiso_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES solicitud_permiso(id) ON DELETE RESTRICT,
  estado_anterior VARCHAR(20),
  estado_nuevo VARCHAR(20) NOT NULL,
  con_descuento BOOLEAN,
  comentario TEXT,
  autor_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_permiso_evento ON solicitud_permiso_evento (solicitud_id, created_at);
DROP TRIGGER IF EXISTS trg_permiso_evento_inmutable ON solicitud_permiso_evento;
CREATE TRIGGER trg_permiso_evento_inmutable BEFORE UPDATE OR DELETE ON solicitud_permiso_evento FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_permiso_evento_no_truncate ON solicitud_permiso_evento;
CREATE TRIGGER trg_permiso_evento_no_truncate BEFORE TRUNCATE ON solicitud_permiso_evento FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

ALTER TABLE solicitud_permiso ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitud_permiso_evento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON solicitud_permiso, solicitud_permiso_evento FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON solicitud_permiso TO afull_api;
GRANT SELECT, INSERT ON solicitud_permiso_evento TO afull_api;
DROP POLICY IF EXISTS api_acceso ON solicitud_permiso;
CREATE POLICY api_acceso ON solicitud_permiso FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_lectura ON solicitud_permiso_evento;
CREATE POLICY api_lectura ON solicitud_permiso_evento FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insercion ON solicitud_permiso_evento;
CREATE POLICY api_insercion ON solicitud_permiso_evento FOR INSERT TO afull_api WITH CHECK (true);
