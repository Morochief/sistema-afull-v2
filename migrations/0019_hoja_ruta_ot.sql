-- Loop 11: la Hoja de ruta de la OT (como en el sistema viejo). docs/LOOP_11_HOJA_RUTA_DISENO.md
-- El default de la base es ACTIVA para que las OTs existentes sigan como hoy; la API crea las nuevas en BORRADOR.
ALTER TABLE orden_trabajo
  ADD COLUMN IF NOT EXISTS hoja_estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVA'
    CHECK (hoja_estado IN ('BORRADOR', 'ACTIVA', 'CERRADA')),
  ADD COLUMN IF NOT EXISTS hoja_notas TEXT CHECK (hoja_notas IS NULL OR char_length(hoja_notas) <= 2000),
  ADD COLUMN IF NOT EXISTS hoja_activada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hoja_whatsapp_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hoja_cerrada_at TIMESTAMPTZ;

ALTER TABLE tarea
  ADD COLUMN IF NOT EXISTS fecha_trabajo DATE,
  ADD COLUMN IF NOT EXISTS cantidad NUMERIC(15,4) CHECK (cantidad IS NULL OR cantidad > 0),
  ADD COLUMN IF NOT EXISTS unidad VARCHAR(20) CHECK (unidad IS NULL OR btrim(unidad) <> ''),
  ADD COLUMN IF NOT EXISTS minutos_estimados INT CHECK (minutos_estimados IS NULL OR minutos_estimados BETWEEN 1 AND 10000);

CREATE INDEX IF NOT EXISTS idx_tarea_persona_fecha ON tarea (persona_asignada_id, fecha_trabajo);
-- Sin tablas ni funciones nuevas: los permisos de afull_api sobre orden_trabajo y tarea no cambian.
