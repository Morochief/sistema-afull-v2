-- MIGRACIÓN 0009: CAMPO Y FLOTA (Loop 4, Claude Code). Diseño: docs/LOOP_4_DISENO.md

-- 1. SEDE (geocerca de asistencia; disuasiva, nunca bloqueante)
CREATE TABLE IF NOT EXISTS sede (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL CHECK (btrim(nombre) <> ''),
  gps_lat NUMERIC(10,7) NOT NULL CHECK (gps_lat BETWEEN -27.7 AND -19.2),
  gps_lng NUMERIC(10,7) NOT NULL CHECK (gps_lng BETWEEN -62.7 AND -54.2),
  radio_m INT NOT NULL DEFAULT 100 CHECK (radio_m BETWEEN 20 AND 1000),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. VEHICULO
CREATE TABLE IF NOT EXISTS vehiculo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapa VARCHAR(20) NOT NULL UNIQUE CHECK (chapa = upper(btrim(chapa)) AND chapa <> ''),
  marca_modelo VARCHAR(100) NOT NULL CHECK (btrim(marca_modelo) <> ''),
  costo_km_gs NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (costo_km_gs >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. HOJA DE RUTA
CREATE TABLE IF NOT EXISTS hoja_ruta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  descripcion VARCHAR(255),
  vehiculo_id UUID REFERENCES vehiculo(id) ON DELETE RESTRICT,
  estado VARCHAR(20) NOT NULL DEFAULT 'PLANIFICADA' CHECK (estado IN ('PLANIFICADA', 'EN_CURSO', 'FINALIZADA')),
  creado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hoja_ruta_fecha ON hoja_ruta (fecha DESC);

CREATE TABLE IF NOT EXISTS hoja_ruta_persona (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_ruta_id UUID NOT NULL REFERENCES hoja_ruta(id) ON DELETE RESTRICT,
  persona_id UUID NOT NULL REFERENCES persona(id) ON DELETE RESTRICT,
  rol VARCHAR(20) NOT NULL DEFAULT 'MONTADOR' CHECK (rol IN ('CONDUCTOR', 'MONTADOR', 'AYUDANTE')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_hoja_ruta_persona UNIQUE (hoja_ruta_id, persona_id)
);
CREATE INDEX IF NOT EXISTS idx_hrp_persona ON hoja_ruta_persona (persona_id);

CREATE TABLE IF NOT EXISTS hoja_ruta_parada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_ruta_id UUID NOT NULL REFERENCES hoja_ruta(id) ON DELETE RESTRICT,
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE RESTRICT,
  orden_secuencia INT NOT NULL CHECK (orden_secuencia >= 1),
  tipo VARCHAR(20) NOT NULL DEFAULT 'PLANIFICADA' CHECK (tipo IN ('PLANIFICADA', 'EXTRA')),
  motivo_extra TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'COMPLETADA', 'OMITIDA')),
  motivo_omision TEXT,
  hora_estimada TIME,
  completada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_parada_secuencia UNIQUE (hoja_ruta_id, orden_secuencia),
  CONSTRAINT chk_parada_extra CHECK (tipo <> 'EXTRA' OR btrim(coalesce(motivo_extra, '')) <> ''),
  CONSTRAINT chk_parada_omitida CHECK (estado <> 'OMITIDA' OR btrim(coalesce(motivo_omision, '')) <> '')
);

-- 4. VIAJE (odómetro). Un viaje abierto por vehículo y uno por conductor; un solo cierre.
CREATE TABLE IF NOT EXISTS viaje (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID NOT NULL REFERENCES vehiculo(id) ON DELETE RESTRICT,
  conductor_persona_id UUID NOT NULL REFERENCES persona(id) ON DELETE RESTRICT,
  hoja_ruta_id UUID REFERENCES hoja_ruta(id) ON DELETE RESTRICT,
  km_inicio NUMERIC(9,1) NOT NULL CHECK (km_inicio >= 0),
  km_fin NUMERIC(9,1),
  motivo_km_inicio TEXT,
  km_estimado_ruta NUMERIC(9,1),
  alerta_desvio BOOLEAN NOT NULL DEFAULT false,
  motivo_desvio TEXT,
  foto_inicio_path TEXT,
  foto_fin_path TEXT,
  gps_lat_inicio NUMERIC(10,7), gps_lng_inicio NUMERIC(10,7),
  gps_lat_fin NUMERIC(10,7), gps_lng_fin NUMERIC(10,7),
  hora_inicio TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  hora_fin TIMESTAMPTZ,
  clave_idempotencia UUID NOT NULL UNIQUE,
  clave_cierre UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_viaje_km CHECK (km_fin IS NULL OR km_fin >= km_inicio),
  CONSTRAINT chk_viaje_cierre CHECK ((km_fin IS NULL) = (hora_fin IS NULL)),
  CONSTRAINT chk_viaje_horas CHECK (hora_fin IS NULL OR hora_fin >= hora_inicio),
  CONSTRAINT chk_viaje_desvio CHECK (NOT alerta_desvio OR btrim(coalesce(motivo_desvio, '')) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_viaje_abierto_vehiculo ON viaje (vehiculo_id) WHERE km_fin IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_viaje_abierto_conductor ON viaje (conductor_persona_id) WHERE km_fin IS NULL;
CREATE INDEX IF NOT EXISTS idx_viaje_vehiculo_fin ON viaje (vehiculo_id, hora_fin DESC);

CREATE OR REPLACE FUNCTION fn_viaje_un_solo_cierre()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.km_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Un viaje cerrado no se modifica' USING ERRCODE = '23514';
  END IF;
  IF NEW.km_fin IS NULL OR NEW.id <> OLD.id OR NEW.vehiculo_id <> OLD.vehiculo_id
     OR NEW.conductor_persona_id <> OLD.conductor_persona_id OR NEW.hoja_ruta_id IS DISTINCT FROM OLD.hoja_ruta_id
     OR NEW.km_inicio <> OLD.km_inicio OR NEW.hora_inicio <> OLD.hora_inicio
     OR NEW.clave_idempotencia <> OLD.clave_idempotencia OR NEW.foto_inicio_path IS DISTINCT FROM OLD.foto_inicio_path
     OR NEW.gps_lat_inicio IS DISTINCT FROM OLD.gps_lat_inicio OR NEW.gps_lng_inicio IS DISTINCT FROM OLD.gps_lng_inicio THEN
    RAISE EXCEPTION 'Solo se permite cerrar el viaje (km_fin, hora_fin y datos de cierre)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_viaje_cierre ON viaje;
CREATE TRIGGER trg_viaje_cierre BEFORE UPDATE ON viaje FOR EACH ROW EXECUTE FUNCTION fn_viaje_un_solo_cierre();
DROP TRIGGER IF EXISTS trg_viaje_no_delete ON viaje;
CREATE TRIGGER trg_viaje_no_delete BEFORE DELETE ON viaje FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_viaje_no_truncate ON viaje;
CREATE TRIGGER trg_viaje_no_truncate BEFORE TRUNCATE ON viaje FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- 5. MARCACIÓN DE ASISTENCIA (inmutable)
CREATE TABLE IF NOT EXISTS marcacion_asistencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES persona(id) ON DELETE RESTRICT,
  sede_id UUID REFERENCES sede(id) ON DELETE RESTRICT,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA')),
  marcada_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  gps_lat NUMERIC(10,7) NOT NULL CHECK (gps_lat BETWEEN -90 AND 90),
  gps_lng NUMERIC(10,7) NOT NULL CHECK (gps_lng BETWEEN -180 AND 180),
  precision_m NUMERIC(8,1),
  distancia_m NUMERIC(10,1),
  dentro_geocerca BOOLEAN NOT NULL,
  ip VARCHAR(64),
  dispositivo_hash VARCHAR(64) NOT NULL,
  clave_idempotencia UUID NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_marcacion_persona ON marcacion_asistencia (persona_id, marcada_at DESC);
DROP TRIGGER IF EXISTS trg_marcacion_inmutable ON marcacion_asistencia;
CREATE TRIGGER trg_marcacion_inmutable BEFORE UPDATE OR DELETE ON marcacion_asistencia
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_marcacion_no_truncate ON marcacion_asistencia;
CREATE TRIGGER trg_marcacion_no_truncate BEFORE TRUNCATE ON marcacion_asistencia
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- updated_at
DROP TRIGGER IF EXISTS trg_sede_upd ON sede;
CREATE TRIGGER trg_sede_upd BEFORE UPDATE ON sede FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
DROP TRIGGER IF EXISTS trg_vehiculo_upd ON vehiculo;
CREATE TRIGGER trg_vehiculo_upd BEFORE UPDATE ON vehiculo FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
DROP TRIGGER IF EXISTS trg_hoja_ruta_upd ON hoja_ruta;
CREATE TRIGGER trg_hoja_ruta_upd BEFORE UPDATE ON hoja_ruta FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
DROP TRIGGER IF EXISTS trg_parada_upd ON hoja_ruta_parada;
CREATE TRIGGER trg_parada_upd BEFORE UPDATE ON hoja_ruta_parada FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- 6. RLS Y PERMISOS (sin DELETE en ninguna)
ALTER TABLE sede ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoja_ruta ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoja_ruta_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoja_ruta_parada ENABLE ROW LEVEL SECURITY;
ALTER TABLE viaje ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcacion_asistencia ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON sede, vehiculo, hoja_ruta, hoja_ruta_persona, hoja_ruta_parada, viaje, marcacion_asistencia
  FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON sede, vehiculo, hoja_ruta, hoja_ruta_persona, hoja_ruta_parada, viaje TO afull_api;
GRANT SELECT, INSERT ON marcacion_asistencia TO afull_api;

DROP POLICY IF EXISTS api_acceso ON sede;
CREATE POLICY api_acceso ON sede FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_acceso ON vehiculo;
CREATE POLICY api_acceso ON vehiculo FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_acceso ON hoja_ruta;
CREATE POLICY api_acceso ON hoja_ruta FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_acceso ON hoja_ruta_persona;
CREATE POLICY api_acceso ON hoja_ruta_persona FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_acceso ON hoja_ruta_parada;
CREATE POLICY api_acceso ON hoja_ruta_parada FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_acceso ON viaje;
CREATE POLICY api_acceso ON viaje FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_lectura ON marcacion_asistencia;
CREATE POLICY api_lectura ON marcacion_asistencia FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insercion ON marcacion_asistencia;
CREATE POLICY api_insercion ON marcacion_asistencia FOR INSERT TO afull_api WITH CHECK (true);
