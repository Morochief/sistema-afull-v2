-- Loop 22: áreas de trabajo y procesos de aFull (lista de José, 24/11/2026). docs/LOOP_22_AREAS_DISENO.md

-- 1. Áreas nuevas (las de aFull + Montaje, Administración y Otro). Los valores viejos se pasan primero.
ALTER TABLE tipo_tarea DROP CONSTRAINT IF EXISTS tipo_tarea_area_check;
ALTER TABLE tipo_tarea DROP CONSTRAINT IF EXISTS ck_tipo_tarea_area;
DROP INDEX IF EXISTS uq_tipo_tarea_nombre;

UPDATE tipo_tarea SET area = CASE codigo
  WHEN 'DISENO' THEN 'DISENO'
  WHEN 'PRESUPUESTO' THEN 'ADMINISTRACION'
  WHEN 'COMPRA' THEN 'ADMINISTRACION'
  WHEN 'RELEVAMIENTO' THEN 'TERMINACIONES'
  WHEN 'TALLER_IMPRESION' THEN 'IMPRESIONES'
  WHEN 'PLOTEO' THEN 'TERMINACIONES'
  WHEN 'TALLER_CORTE' THEN 'TERMINACIONES'
  WHEN 'REFILADO' THEN 'TERMINACIONES'
  WHEN 'PREPARACION' THEN 'TERMINACIONES'
  WHEN 'FABRICACION' THEN 'CARPINTERIA'
  WHEN 'TALLER_HERRERIA' THEN 'HERRERIA'
  WHEN 'CARPINTERIA' THEN 'CARPINTERIA'
  WHEN 'LIJADO' THEN 'CARPINTERIA'
  WHEN 'PINTURA' THEN 'PINTURA'
  WHEN 'ENFILADO' THEN 'TERMINACIONES'
  WHEN 'LIMPIEZA' THEN 'TERMINACIONES'
  WHEN 'CARGA_DESCARGA' THEN 'TERMINACIONES'
  WHEN 'RETIRO' THEN 'LOGISTICA'
  WHEN 'ENTREGA' THEN 'LOGISTICA'
  WHEN 'MONTAJE_CALLE' THEN 'MONTAJE'
  WHEN 'REPARACION' THEN 'MONTAJE'
  ELSE CASE area WHEN 'DISENO' THEN 'DISENO' WHEN 'CALLE' THEN 'MONTAJE' WHEN 'COMERCIAL' THEN 'ADMINISTRACION' ELSE 'OTRO' END
END
WHERE area NOT IN ('TERMINACIONES', 'CARPINTERIA', 'PINTURA', 'IMPRESIONES', 'HERRERIA', 'LOGISTICA', 'MONTAJE', 'DISENO', 'ADMINISTRACION', 'OTRO');

ALTER TABLE tipo_tarea ADD CONSTRAINT ck_tipo_tarea_area CHECK (area IN
  ('TERMINACIONES', 'CARPINTERIA', 'PINTURA', 'IMPRESIONES', 'HERRERIA', 'LOGISTICA', 'MONTAJE', 'DISENO', 'ADMINISTRACION', 'OTRO'));
-- El mismo nombre puede estar en dos áreas ("Lijado" en Carpintería y en Pintura), no dos veces en la misma.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_tarea_area_nombre ON tipo_tarea (area, lower(nombre));

-- 2. Medidas en cm y tanda: una marca del proceso (antes, una lista fija en el código).
ALTER TABLE tipo_tarea ADD COLUMN IF NOT EXISTS con_medidas BOOLEAN NOT NULL DEFAULT false;
UPDATE tipo_tarea SET con_medidas = true WHERE codigo IN ('TALLER_IMPRESION', 'PLOTEO', 'TALLER_CORTE', 'REFILADO');

-- 3. Nombres como los usa aFull (las tareas guardan el código: su historial no cambia).
UPDATE tipo_tarea SET nombre = 'Relevamiento' WHERE codigo = 'RELEVAMIENTO';
UPDATE tipo_tarea SET nombre = 'Corte adhesivo' WHERE codigo = 'TALLER_CORTE';
UPDATE tipo_tarea SET nombre = 'Preparación de materiales' WHERE codigo = 'PREPARACION';
UPDATE tipo_tarea SET nombre = 'Fabricación' WHERE codigo = 'TALLER_HERRERIA';
UPDATE tipo_tarea SET nombre = 'Proceso de pintura' WHERE codigo = 'PINTURA';
UPDATE tipo_tarea SET nombre = 'Carga de móvil' WHERE codigo = 'CARGA_DESCARGA';
UPDATE tipo_tarea SET nombre = 'Retiro de materiales' WHERE codigo = 'RETIRO';
UPDATE tipo_tarea SET nombre = 'Entrega de materiales' WHERE codigo = 'ENTREGA';
-- "Carpintería" ahora es un área, no un proceso: se desactiva (no se borra).
UPDATE tipo_tarea SET activo = false WHERE codigo = 'CARPINTERIA';

-- 4. Procesos de la lista de José que faltaban.
INSERT INTO tipo_tarea (codigo, nombre, area, orden, con_medidas) VALUES
  ('PLOTEO_Y_LIJADO', 'Ploteo y lijado', 'TERMINACIONES', 31, false),
  ('COLOCACION_DE_LEDS', 'Colocación de LEDs', 'TERMINACIONES', 31, false),
  ('CORTE_MDF', 'Corte MDF', 'CARPINTERIA', 35, true),
  ('DESPIECE_DE_MATERIALES', 'Despiece de materiales', 'CARPINTERIA', 35, false),
  ('COLOCACION_DE_ENDUIDO', 'Colocación de enduido', 'PINTURA', 40, false),
  ('COLOCACION_DE_ENDUIDO_Y_LIJADO', 'Colocación de enduido y lijado', 'PINTURA', 40, false),
  ('LIJADO_PINTURA', 'Lijado', 'PINTURA', 40, false),
  ('MONTAJE_DE_IMPRESION', 'Montaje de impresión', 'IMPRESIONES', 30, false),
  ('DESPIECE_HERRERIA', 'Despiece de materiales', 'HERRERIA', 36, false),
  ('LIMPIEZA_DE_CANOS', 'Limpieza de caños', 'HERRERIA', 36, false),
  ('COBRANZA', 'Cobranza', 'LOGISTICA', 51, false),
  ('ENTREGA_DE_RECIBO', 'Entrega de recibo', 'LOGISTICA', 51, false),
  ('INFORME', 'Informe', 'DISENO', 11, false),
  ('REDES_SOCIALES', 'Redes sociales', 'DISENO', 11, false),
  ('PREPARACION_DE_ORIGINALES', 'Preparación de originales', 'DISENO', 11, false),
  ('MEDICION', 'Medición', 'DISENO', 11, false)
ON CONFLICT (codigo) DO NOTHING;
