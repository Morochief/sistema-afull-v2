-- Loop 22, ajuste (José, 25/11/2026): el montaje entra en Logística ("montaje/desmontaje/instalación"),
-- y no es un área aparte. La gente de producción también lo hace: ya tienen En la calle con la capacidad taller.
UPDATE tipo_tarea SET area = 'LOGISTICA' WHERE area = 'MONTAJE';
ALTER TABLE tipo_tarea DROP CONSTRAINT IF EXISTS ck_tipo_tarea_area;
ALTER TABLE tipo_tarea ADD CONSTRAINT ck_tipo_tarea_area CHECK (area IN
  ('TERMINACIONES', 'CARPINTERIA', 'PINTURA', 'IMPRESIONES', 'HERRERIA', 'LOGISTICA', 'DISENO', 'ADMINISTRACION', 'OTRO'));
INSERT INTO tipo_tarea (codigo, nombre, area, orden, con_medidas) VALUES
  ('DESMONTAJE', 'Desmontaje', 'LOGISTICA', 52, false),
  ('INSTALACION', 'Instalación', 'LOGISTICA', 52, false)
ON CONFLICT (codigo) DO NOTHING;
