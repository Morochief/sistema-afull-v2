-- MIGRACIÓN 0018: FOTOS Y ARCHIVOS (Loop 4, L4.E3)
-- Un solo registro para todo lo que se sube: odómetro, evidencias de montaje, muestras de impresión,
-- comprobantes de permisos y fotos de pedidos del portal. El archivo vive en Supabase Storage (bucket PRIVADO);
-- acá queda quién lo subió, de qué es y su tamaño real. Flujo: la API registra el archivo PENDIENTE y firma una
-- URL de subida; el celular sube directo a Storage; la API confirma (mira el tamaño real) y lo pasa a SUBIDO.
-- Nada se borra: la fila solo cambia una vez, de PENDIENTE a SUBIDO.

CREATE TABLE IF NOT EXISTS archivo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN
    ('ODOMETRO_INICIO', 'ODOMETRO_FIN', 'EVIDENCIA_PARADA', 'MUESTRA_TAREA', 'COMPROBANTE_PERMISO', 'FOTO_PEDIDO')),
  ruta TEXT NOT NULL UNIQUE CHECK (ruta ~ '^[a-z_]+/[0-9]{4}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  mime VARCHAR(40) NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes_declarados INT NOT NULL CHECK (bytes_declarados BETWEEN 1 AND 10485760),
  bytes INT CHECK (bytes IS NULL OR bytes BETWEEN 1 AND 10485760),
  estado VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'SUBIDO')),
  viaje_id UUID REFERENCES viaje(id) ON DELETE RESTRICT,
  parada_id UUID REFERENCES hoja_ruta_parada(id) ON DELETE RESTRICT,
  tarea_id UUID REFERENCES tarea(id) ON DELETE RESTRICT,
  solicitud_permiso_id UUID REFERENCES solicitud_permiso(id) ON DELETE RESTRICT,
  pedido_id UUID REFERENCES pedido(id) ON DELETE RESTRICT,
  subido_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  portal_acceso_id UUID REFERENCES portal_acceso(id) ON DELETE RESTRICT,
  clave_idempotencia UUID NOT NULL UNIQUE,
  -- Hora en que se sacó la foto (la del celular, si se guardó sin señal; la API la acota como en 0017).
  tomada_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sin_senal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  subido_at TIMESTAMPTZ,
  -- Cada tipo cuelga de exactamente una cosa, y de la que corresponde.
  CONSTRAINT chk_archivo_referencia CHECK (
    num_nonnulls(viaje_id, parada_id, tarea_id, solicitud_permiso_id, pedido_id) = 1 AND (
      (tipo IN ('ODOMETRO_INICIO', 'ODOMETRO_FIN') AND viaje_id IS NOT NULL)
      OR (tipo = 'EVIDENCIA_PARADA' AND parada_id IS NOT NULL)
      OR (tipo = 'MUESTRA_TAREA' AND tarea_id IS NOT NULL)
      OR (tipo = 'COMPROBANTE_PERMISO' AND solicitud_permiso_id IS NOT NULL)
      OR (tipo = 'FOTO_PEDIDO' AND pedido_id IS NOT NULL))),
  -- Lo sube un usuario del sistema, o el cliente por su enlace (solo fotos de sus pedidos).
  CONSTRAINT chk_archivo_autor CHECK (
    num_nonnulls(subido_por, portal_acceso_id) = 1 AND (portal_acceso_id IS NULL OR tipo = 'FOTO_PEDIDO')),
  -- PDF solo para comprobantes; el resto son fotos.
  CONSTRAINT chk_archivo_pdf CHECK (mime <> 'application/pdf' OR tipo = 'COMPROBANTE_PERMISO'),
  CONSTRAINT chk_archivo_estado CHECK (
    (estado = 'PENDIENTE' AND bytes IS NULL AND subido_at IS NULL) OR (estado = 'SUBIDO' AND bytes IS NOT NULL AND subido_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_archivo_viaje ON archivo (viaje_id) WHERE viaje_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_archivo_parada ON archivo (parada_id) WHERE parada_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_archivo_tarea ON archivo (tarea_id) WHERE tarea_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_archivo_permiso ON archivo (solicitud_permiso_id) WHERE solicitud_permiso_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_archivo_pedido ON archivo (pedido_id) WHERE pedido_id IS NOT NULL;
-- Una sola foto de odómetro subida por viaje y momento (salida / vuelta).
CREATE UNIQUE INDEX IF NOT EXISTS uq_archivo_odometro ON archivo (viaje_id, tipo)
  WHERE tipo IN ('ODOMETRO_INICIO', 'ODOMETRO_FIN') AND estado = 'SUBIDO';

-- Única modificación permitida: PENDIENTE → SUBIDO (con el tamaño real). Lo demás queda como se registró.
CREATE OR REPLACE FUNCTION fn_archivo_solo_confirmar()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado <> 'PENDIENTE' OR NEW.estado <> 'SUBIDO' THEN
    RAISE EXCEPTION 'Un archivo solo pasa una vez de PENDIENTE a SUBIDO' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - 'estado' - 'bytes' - 'subido_at') <> (to_jsonb(OLD) - 'estado' - 'bytes' - 'subido_at') THEN
    RAISE EXCEPTION 'Al confirmar un archivo solo cambian estado, bytes y subido_at' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archivo_confirmar ON archivo;
CREATE TRIGGER trg_archivo_confirmar BEFORE UPDATE ON archivo FOR EACH ROW EXECUTE FUNCTION fn_archivo_solo_confirmar();
DROP TRIGGER IF EXISTS trg_archivo_no_delete ON archivo;
CREATE TRIGGER trg_archivo_no_delete BEFORE DELETE ON archivo FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_archivo_no_truncate ON archivo;
CREATE TRIGGER trg_archivo_no_truncate BEFORE TRUNCATE ON archivo FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

ALTER TABLE archivo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON archivo FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON archivo TO afull_api;
DROP POLICY IF EXISTS api_acceso ON archivo;
CREATE POLICY api_acceso ON archivo FOR ALL TO afull_api USING (true) WITH CHECK (true);

-- Bucket PRIVADO en Supabase Storage, con tope de tamaño y tipos permitidos (Storage los rechaza al subir).
-- En una base sin Storage (CI, PostgreSQL local) no existe el esquema `storage`: se saltea.
-- Si el rol no tiene permiso sobre storage.buckets, la migración no falla: avisa, y el bucket se crea desde el panel
-- con los mismos datos (ver docs/LOOP_4_DISENO.md §7).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'Sin esquema storage: no se crea el bucket afull-archivos';
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('afull-archivos', 'afull-archivos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
  RAISE NOTICE 'No se pudo crear el bucket afull-archivos por SQL (%): crearlo desde el panel de Supabase', SQLERRM;
END;
$$;
