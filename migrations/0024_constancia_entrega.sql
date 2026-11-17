-- Loop 17: constancia de entrega en la parada. docs/LOOP_17_CONSTANCIA_ENTREGA_DISENO.md
ALTER TABLE hoja_ruta_parada
  ADD COLUMN IF NOT EXISTS receptor_nombre VARCHAR(120) CHECK (receptor_nombre IS NULL OR char_length(btrim(receptor_nombre)) >= 2),
  ADD COLUMN IF NOT EXISTS receptor_cargo VARCHAR(60) CHECK (receptor_cargo IS NULL OR btrim(receptor_cargo) <> ''),
  ADD COLUMN IF NOT EXISTS completada_por UUID REFERENCES usuario(id) ON DELETE RESTRICT;

ALTER TABLE orden_trabajo ADD COLUMN IF NOT EXISTS lleva_remision BOOLEAN NOT NULL DEFAULT true;

-- Lo que recibió quien firmó no se pisa: una vez cargado, receptor y cargo quedan fijos.
CREATE OR REPLACE FUNCTION fn_parada_entrega_fija() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.receptor_nombre IS NOT NULL AND (NEW.receptor_nombre IS DISTINCT FROM OLD.receptor_nombre
      OR NEW.receptor_cargo IS DISTINCT FROM OLD.receptor_cargo OR NEW.completada_por IS DISTINCT FROM OLD.completada_por) THEN
    RAISE EXCEPTION 'La entrega ya está cargada: no se cambia quién recibió' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION fn_parada_entrega_fija() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_parada_entrega_fija ON hoja_ruta_parada;
CREATE TRIGGER trg_parada_entrega_fija BEFORE UPDATE ON hoja_ruta_parada FOR EACH ROW EXECUTE FUNCTION fn_parada_entrega_fija();

-- Foto de la remisión firmada: cuelga de la parada; una sola subida por parada.
ALTER TABLE archivo DROP CONSTRAINT IF EXISTS archivo_tipo_check;
ALTER TABLE archivo ADD CONSTRAINT archivo_tipo_check CHECK (tipo IN
  ('ODOMETRO_INICIO', 'ODOMETRO_FIN', 'EVIDENCIA_PARADA', 'REMISION_PARADA', 'MUESTRA_TAREA', 'COMPROBANTE_PERMISO', 'FOTO_PEDIDO'));
ALTER TABLE archivo DROP CONSTRAINT IF EXISTS chk_archivo_referencia;
ALTER TABLE archivo ADD CONSTRAINT chk_archivo_referencia CHECK (
  num_nonnulls(viaje_id, parada_id, tarea_id, solicitud_permiso_id, pedido_id) = 1 AND (
    (tipo IN ('ODOMETRO_INICIO', 'ODOMETRO_FIN') AND viaje_id IS NOT NULL)
    OR (tipo IN ('EVIDENCIA_PARADA', 'REMISION_PARADA') AND parada_id IS NOT NULL)
    OR (tipo = 'MUESTRA_TAREA' AND tarea_id IS NOT NULL)
    OR (tipo = 'COMPROBANTE_PERMISO' AND solicitud_permiso_id IS NOT NULL)
    OR (tipo = 'FOTO_PEDIDO' AND pedido_id IS NOT NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_archivo_remision ON archivo (parada_id) WHERE tipo = 'REMISION_PARADA' AND estado = 'SUBIDO';
-- Sin tablas nuevas; la función es de trigger (no necesita GRANT EXECUTE). Permisos de afull_api sin cambios.
