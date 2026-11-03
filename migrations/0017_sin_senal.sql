-- MIGRACIÓN 0017: ACCIONES CARGADAS SIN SEÑAL (Loop 4, L4.E4)
-- El celular guarda la acción con su hora real y la manda cuando vuelve la señal. Se guarda esa hora (con límites
-- en la API: no futura, no más de 72 h atrás) y queda MARCADA como "sin señal" para que RR.HH. y Comercial lo vean:
-- el reloj del celular, como el GPS, es falsificable (disuasivo, no prueba).

ALTER TABLE marcacion_asistencia ADD COLUMN IF NOT EXISTS sin_senal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE marcacion_asistencia ADD COLUMN IF NOT EXISTS recibida_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();

ALTER TABLE viaje ADD COLUMN IF NOT EXISTS inicio_sin_senal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS cierre_sin_senal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE hoja_ruta_parada ADD COLUMN IF NOT EXISTS cierre_sin_senal BOOLEAN NOT NULL DEFAULT false;

-- El cierre del viaje no puede tocar lo del inicio (se agrega inicio_sin_senal a lo protegido).
CREATE OR REPLACE FUNCTION fn_viaje_un_solo_cierre()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.km_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Un viaje cerrado no se modifica' USING ERRCODE = '23514';
  END IF;
  IF NEW.km_fin IS NULL OR NEW.id <> OLD.id OR NEW.vehiculo_id <> OLD.vehiculo_id
     OR NEW.conductor_persona_id <> OLD.conductor_persona_id OR NEW.hoja_ruta_id IS DISTINCT FROM OLD.hoja_ruta_id
     OR NEW.km_inicio <> OLD.km_inicio OR NEW.hora_inicio <> OLD.hora_inicio OR NEW.inicio_sin_senal <> OLD.inicio_sin_senal
     OR NEW.clave_idempotencia <> OLD.clave_idempotencia OR NEW.foto_inicio_path IS DISTINCT FROM OLD.foto_inicio_path
     OR NEW.gps_lat_inicio IS DISTINCT FROM OLD.gps_lat_inicio OR NEW.gps_lng_inicio IS DISTINCT FROM OLD.gps_lng_inicio THEN
    RAISE EXCEPTION 'Solo se permite cerrar el viaje (km_fin, hora_fin y datos de cierre)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
