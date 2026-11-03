-- MIGRACIÓN 0011 (Claude Code, 2026-11-03)
-- A) IVA APARTE (decisión del usuario): total_gs es el precio SIN IVA (base × (1 + markup)), que es lo que
--    se reparte a las OTs y se compara con el costo; iva_gs = 10 % de total_gs, congelado al enviar.
ALTER TABLE presupuesto ADD COLUMN IF NOT EXISTS iva_gs BIGINT CHECK (iva_gs IS NULL OR iva_gs >= 0);

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
    OR NEW.iva_gs IS DISTINCT FROM OLD.iva_gs
    OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
    OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Presupuesto %: fuera de BORRADOR solo puede cambiar de estado', OLD.estado USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- B) DISEÑOS (Loop 7, simplificado según el uso real): el archivo vive en Google Drive; acá queda el enlace,
--    de dónde vino (cliente o diseñadora) y la verificación obligatoria de Juan o Sofi antes de que Edu produzca.
CREATE TABLE IF NOT EXISTS diseno_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE RESTRICT,
  version INT NOT NULL CHECK (version >= 1),
  origen VARCHAR(20) NOT NULL CHECK (origen IN ('CLIENTE', 'DISENADORA')),
  drive_url TEXT NOT NULL CHECK (drive_url ~ '^https://(drive|docs)\.google\.com/' AND length(drive_url) <= 500),
  notas TEXT,
  subido_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  subido_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADO', 'OBSERVADO')),
  revisado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  revisado_at TIMESTAMPTZ,
  observacion TEXT,
  CONSTRAINT uq_diseno_ot_version UNIQUE (orden_trabajo_id, version),
  CONSTRAINT chk_diseno_revision CHECK ((estado = 'PENDIENTE') = (revisado_por IS NULL AND revisado_at IS NULL)),
  CONSTRAINT chk_diseno_observacion CHECK (estado <> 'OBSERVADO' OR btrim(coalesce(observacion, '')) <> '')
);
-- Una sola versión esperando revisión por OT.
CREATE UNIQUE INDEX IF NOT EXISTS uq_diseno_pendiente ON diseno_version (orden_trabajo_id) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS idx_diseno_estado ON diseno_version (estado, subido_at DESC);

-- Una versión se revisa UNA vez (PENDIENTE → APROBADO u OBSERVADO) y queda inmutable; sin DELETE.
CREATE OR REPLACE FUNCTION fn_diseno_una_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La versión de diseño ya fue revisada y no se modifica' USING ERRCODE = '23514';
  END IF;
  IF NEW.estado = 'PENDIENTE' OR NEW.orden_trabajo_id <> OLD.orden_trabajo_id OR NEW.version <> OLD.version
     OR NEW.origen <> OLD.origen OR NEW.drive_url <> OLD.drive_url OR NEW.notas IS DISTINCT FROM OLD.notas
     OR NEW.subido_por <> OLD.subido_por OR NEW.subido_at <> OLD.subido_at THEN
    RAISE EXCEPTION 'Solo se permite registrar la revisión del diseño' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_diseno_revision ON diseno_version;
CREATE TRIGGER trg_diseno_revision BEFORE UPDATE ON diseno_version FOR EACH ROW EXECUTE FUNCTION fn_diseno_una_revision();
DROP TRIGGER IF EXISTS trg_diseno_no_delete ON diseno_version;
CREATE TRIGGER trg_diseno_no_delete BEFORE DELETE ON diseno_version FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_diseno_no_truncate ON diseno_version;
CREATE TRIGGER trg_diseno_no_truncate BEFORE TRUNCATE ON diseno_version FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

ALTER TABLE diseno_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON diseno_version FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON diseno_version TO afull_api;
DROP POLICY IF EXISTS api_acceso ON diseno_version;
CREATE POLICY api_acceso ON diseno_version FOR ALL TO afull_api USING (true) WITH CHECK (true);
