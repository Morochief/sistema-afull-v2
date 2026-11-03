-- MIGRACIÓN 0010: tipo de tarea DISENO (Claude Code, 2026-11-03).
-- Sofi confirmó que Nachi (diseñadora) registra su tiempo "como todos los usuarios":
-- sus horas de diseño van al cronómetro y al costeo de la OT.
ALTER TABLE tarea DROP CONSTRAINT IF EXISTS tarea_tipo_check;
ALTER TABLE tarea ADD CONSTRAINT tarea_tipo_check CHECK (
  tipo IN ('DISENO', 'TALLER_IMPRESION', 'TALLER_CORTE', 'TALLER_HERRERIA', 'TALLER_ARMADO', 'MONTAJE_CALLE', 'OTRO')
);
