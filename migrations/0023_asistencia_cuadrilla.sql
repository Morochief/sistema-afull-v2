-- Loop 16: asistencia de la cuadrilla y marcación remota. docs/LOOP_16_ASISTENCIA_CUADRILLA_DISENO.md
-- PROPIA: la persona desde su celular (como hasta ahora). CUADRILLA: el conductor por los de su salida.
-- REMOTO: la persona fuera de toda geocerca, con el motivo (la geocerca sigue siendo disuasiva, no bloquea).
ALTER TABLE marcacion_asistencia
  ADD COLUMN IF NOT EXISTS origen VARCHAR(12) NOT NULL DEFAULT 'PROPIA',
  ADD COLUMN IF NOT EXISTS marcada_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS hoja_ruta_id UUID REFERENCES hoja_ruta(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS motivo_remoto TEXT;

ALTER TABLE marcacion_asistencia DROP CONSTRAINT IF EXISTS ck_marcacion_origen;
ALTER TABLE marcacion_asistencia ADD CONSTRAINT ck_marcacion_origen CHECK (
  (origen = 'PROPIA' AND marcada_por IS NULL AND hoja_ruta_id IS NULL AND motivo_remoto IS NULL)
  OR (origen = 'CUADRILLA' AND marcada_por IS NOT NULL AND hoja_ruta_id IS NOT NULL)
  OR (origen = 'REMOTO' AND marcada_por IS NULL AND hoja_ruta_id IS NULL AND motivo_remoto IS NOT NULL)
);
ALTER TABLE marcacion_asistencia DROP CONSTRAINT IF EXISTS ck_marcacion_motivo_remoto;
ALTER TABLE marcacion_asistencia ADD CONSTRAINT ck_marcacion_motivo_remoto
  CHECK (motivo_remoto IS NULL OR char_length(btrim(motivo_remoto)) BETWEEN 3 AND 300);

CREATE INDEX IF NOT EXISTS idx_marcacion_hoja_ruta ON marcacion_asistencia (hoja_ruta_id) WHERE hoja_ruta_id IS NOT NULL;
-- Sin tablas ni funciones nuevas: la tabla sigue inmutable (trigger de 0009) y los permisos de afull_api (SELECT, INSERT) no cambian.
