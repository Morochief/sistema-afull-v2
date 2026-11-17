-- Loop 19: Nachi verifica su diseño y lo corrige sin esperar a la oficina (docs/LOOP_19_NACHI_VERIFICA_DISENO.md).
ALTER TABLE diseno_version
  ADD COLUMN IF NOT EXISTS autoverificada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_cambio TEXT CHECK (motivo_cambio IS NULL OR char_length(motivo_cambio) <= 500),
  ADD COLUMN IF NOT EXISTS anulada_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS anulada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT CHECK (motivo_anulacion IS NULL OR char_length(motivo_anulacion) <= 500),
  ADD COLUMN IF NOT EXISTS observado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS observado_at TIMESTAMPTZ;

ALTER TABLE diseno_version DROP CONSTRAINT IF EXISTS diseno_version_estado_check;
ALTER TABLE diseno_version ADD CONSTRAINT diseno_version_estado_check CHECK (estado IN ('PENDIENTE', 'APROBADO', 'OBSERVADO', 'ANULADA'));
ALTER TABLE diseno_version DROP CONSTRAINT IF EXISTS chk_diseno_revision;
ALTER TABLE diseno_version ADD CONSTRAINT chk_diseno_revision CHECK (
  (estado = 'PENDIENTE' AND revisado_por IS NULL AND revisado_at IS NULL)
  OR (estado IN ('APROBADO', 'OBSERVADO') AND revisado_por IS NOT NULL AND revisado_at IS NOT NULL)
  OR (estado = 'ANULADA' AND revisado_por IS NULL AND anulada_por IS NOT NULL AND anulada_at IS NOT NULL AND btrim(coalesce(motivo_anulacion, '')) <> '')
);
-- Autoverificada solo si quedó aprobada (o después observada por la oficina); la observación posterior lleva quién y cuándo.
ALTER TABLE diseno_version DROP CONSTRAINT IF EXISTS chk_diseno_autoverificada;
ALTER TABLE diseno_version ADD CONSTRAINT chk_diseno_autoverificada CHECK (NOT autoverificada OR estado IN ('APROBADO', 'OBSERVADO'));
ALTER TABLE diseno_version DROP CONSTRAINT IF EXISTS chk_diseno_observado_despues;
ALTER TABLE diseno_version ADD CONSTRAINT chk_diseno_observado_despues CHECK (
  (observado_por IS NULL) = (observado_at IS NULL) AND (observado_por IS NULL OR (estado = 'OBSERVADO' AND autoverificada))
);

-- Revisión: PENDIENTE → APROBADO | OBSERVADO | ANULADA, una vez. Además, una aprobada por la diseñadora
-- puede ser observada después por la oficina (una vez). Nada más cambia; sin DELETE (trigger de 0011).
CREATE OR REPLACE FUNCTION fn_diseno_una_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.orden_trabajo_id <> OLD.orden_trabajo_id OR NEW.version <> OLD.version OR NEW.origen <> OLD.origen
     OR NEW.drive_url <> OLD.drive_url OR NEW.notas IS DISTINCT FROM OLD.notas OR NEW.subido_por <> OLD.subido_por
     OR NEW.subido_at <> OLD.subido_at OR NEW.motivo_cambio IS DISTINCT FROM OLD.motivo_cambio THEN
    RAISE EXCEPTION 'Solo se permite registrar la revisión del diseño' USING ERRCODE = '23514';
  END IF;
  IF OLD.estado = 'PENDIENTE' AND NEW.estado IN ('APROBADO', 'OBSERVADO', 'ANULADA')
     AND NEW.observado_por IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.estado = 'APROBADO' AND OLD.autoverificada AND NEW.estado = 'OBSERVADO' AND NEW.autoverificada
     AND OLD.observado_por IS NULL AND NEW.observado_por IS NOT NULL
     AND NEW.revisado_por = OLD.revisado_por AND NEW.revisado_at = OLD.revisado_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La versión de diseño ya fue revisada y no se modifica' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
