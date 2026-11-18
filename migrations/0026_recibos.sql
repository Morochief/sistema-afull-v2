-- Loop 21: recibos de dinero y cobranzas (como el de Prosegur). docs/LOOP_21_RECIBOS_DISENO.md
-- El sistema NO factura: registra las facturas que aFull ya emitió con su sistema electrónico, los cobros y el saldo.

-- 1. Datos de aFull para el encabezado del recibo (una sola fila).
CREATE TABLE IF NOT EXISTS empresa_dato (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  razon_social VARCHAR(150) NOT NULL CHECK (btrim(razon_social) <> ''),
  ruc VARCHAR(20) NOT NULL CHECK (ruc ~ '^\d{3,10}-\d$'),
  direccion VARCHAR(200),
  ciudad VARCHAR(80),
  telefono VARCHAR(60),
  email VARCHAR(120),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_por UUID REFERENCES usuario(id) ON DELETE RESTRICT
);

-- 2. Facturas ya emitidas (por el sistema de facturación electrónica de aFull) que hay que cobrar.
CREATE TABLE IF NOT EXISTS factura_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero VARCHAR(15) NOT NULL UNIQUE CHECK (numero ~ '^\d{3}-\d{3}-\d{7}$'),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL,
  monto_gs BIGINT NOT NULL CHECK (monto_gs > 0),
  orden_trabajo_id UUID REFERENCES orden_trabajo(id) ON DELETE RESTRICT,
  proyecto_id UUID REFERENCES proyecto(id) ON DELETE RESTRICT,
  nota TEXT CHECK (nota IS NULL OR char_length(nota) <= 500),
  creado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulada_at TIMESTAMPTZ,
  anulada_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  motivo_anulacion TEXT,
  UNIQUE (id, cliente_id),
  CONSTRAINT ck_factura_anulacion CHECK ((anulada_at IS NULL) = (anulada_por IS NULL)
    AND (anulada_at IS NULL) = (motivo_anulacion IS NULL)
    AND (motivo_anulacion IS NULL OR char_length(btrim(motivo_anulacion)) BETWEEN 3 AND 300))
);
CREATE INDEX IF NOT EXISTS idx_factura_cliente_cliente ON factura_cliente (cliente_id, fecha DESC);

-- 3. Recibos de dinero.
CREATE TABLE IF NOT EXISTS recibo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero VARCHAR(20) NOT NULL UNIQUE,
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL,
  importe_gs BIGINT NOT NULL CHECK (importe_gs > 0),
  retenciones_gs BIGINT NOT NULL DEFAULT 0 CHECK (retenciones_gs >= 0),
  retencion_numero VARCHAR(30),
  medio VARCHAR(20) NOT NULL CHECK (medio IN ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'BILLETERA', 'DEBITO_AUTOMATICO', 'OTRO')),
  banco VARCHAR(80),
  referencia VARCHAR(80),
  nota TEXT CHECK (nota IS NULL OR char_length(nota) <= 500),
  cobrador_nombre VARCHAR(120) NOT NULL,
  emitido_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clave_idempotencia UUID NOT NULL UNIQUE,
  anulado_at TIMESTAMPTZ,
  anulado_por UUID REFERENCES usuario(id) ON DELETE RESTRICT,
  motivo_anulacion TEXT,
  UNIQUE (id, cliente_id),
  CONSTRAINT ck_recibo_anulacion CHECK ((anulado_at IS NULL) = (anulado_por IS NULL)
    AND (anulado_at IS NULL) = (motivo_anulacion IS NULL)
    AND (motivo_anulacion IS NULL OR char_length(btrim(motivo_anulacion)) BETWEEN 3 AND 300))
);
CREATE INDEX IF NOT EXISTS idx_recibo_cliente ON recibo (cliente_id, fecha DESC);

-- 4. Qué factura paga cada recibo. FK compuestas: un recibo solo paga facturas de SU cliente.
CREATE TABLE IF NOT EXISTS recibo_aplicacion (
  recibo_id UUID NOT NULL,
  factura_id UUID NOT NULL,
  cliente_id UUID NOT NULL,
  monto_gs BIGINT NOT NULL CHECK (monto_gs > 0),
  PRIMARY KEY (recibo_id, factura_id),
  FOREIGN KEY (recibo_id, cliente_id) REFERENCES recibo(id, cliente_id) ON DELETE RESTRICT,
  FOREIGN KEY (factura_id, cliente_id) REFERENCES factura_cliente(id, cliente_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_recibo_aplicacion_factura ON recibo_aplicacion (factura_id);

-- 5. Lo cobrado de una factura nunca pasa su monto (contando solo recibos vigentes), ni se cobra una anulada.
--    El FOR UPDATE sobre la factura ordena dos recibos simultáneos.
CREATE OR REPLACE FUNCTION fn_recibo_aplicacion_valida() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE f RECORD; cobrado BIGINT;
BEGIN
  SELECT monto_gs, anulada_at INTO f FROM factura_cliente WHERE id = NEW.factura_id FOR UPDATE;
  IF f.anulada_at IS NOT NULL THEN
    RAISE EXCEPTION 'La factura está anulada' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(sum(a.monto_gs), 0) INTO cobrado FROM recibo_aplicacion a JOIN recibo r ON r.id = a.recibo_id
   WHERE a.factura_id = NEW.factura_id AND r.anulado_at IS NULL;
  IF cobrado + NEW.monto_gs > f.monto_gs THEN
    RAISE EXCEPTION 'El cobro pasa el saldo de la factura' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_recibo_aplicacion_valida ON recibo_aplicacion;
CREATE TRIGGER trg_recibo_aplicacion_valida BEFORE INSERT ON recibo_aplicacion FOR EACH ROW EXECUTE FUNCTION fn_recibo_aplicacion_valida();
DROP TRIGGER IF EXISTS trg_recibo_aplicacion_inmutable ON recibo_aplicacion;
CREATE TRIGGER trg_recibo_aplicacion_inmutable BEFORE UPDATE OR DELETE ON recibo_aplicacion FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_inmutable();
DROP TRIGGER IF EXISTS trg_recibo_aplicacion_no_truncate ON recibo_aplicacion;
CREATE TRIGGER trg_recibo_aplicacion_no_truncate BEFORE TRUNCATE ON recibo_aplicacion FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_inmutable();

-- 6. Una anulación no se deshace, y una factura con cobros vigentes no se anula.
CREATE OR REPLACE FUNCTION fn_anulacion_definitiva() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'factura_cliente' THEN
    IF OLD.anulada_at IS NOT NULL THEN RAISE EXCEPTION 'La factura ya está anulada' USING ERRCODE = '23514'; END IF;
    IF NEW.anulada_at IS NOT NULL AND EXISTS (SELECT 1 FROM recibo_aplicacion a JOIN recibo r ON r.id = a.recibo_id
        WHERE a.factura_id = NEW.id AND r.anulado_at IS NULL) THEN
      RAISE EXCEPTION 'La factura tiene cobros vigentes' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.anulado_at IS NOT NULL THEN
    RAISE EXCEPTION 'El recibo ya está anulado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_factura_anulacion ON factura_cliente;
CREATE TRIGGER trg_factura_anulacion BEFORE UPDATE ON factura_cliente FOR EACH ROW EXECUTE FUNCTION fn_anulacion_definitiva();
DROP TRIGGER IF EXISTS trg_recibo_anulacion ON recibo;
CREATE TRIGGER trg_recibo_anulacion BEFORE UPDATE ON recibo FOR EACH ROW EXECUTE FUNCTION fn_anulacion_definitiva();
REVOKE EXECUTE ON FUNCTION fn_recibo_aplicacion_valida(), fn_anulacion_definitiva() FROM PUBLIC, anon, authenticated;

-- 7. Saldo de cada factura (solo cuentan los recibos vigentes).
CREATE OR REPLACE VIEW v_factura_saldo WITH (security_invoker = true) AS
SELECT f.id, f.numero, f.cliente_id, f.fecha, f.monto_gs, f.orden_trabajo_id, f.proyecto_id, f.nota, f.created_at,
       f.anulada_at, f.motivo_anulacion,
       coalesce(c.cobrado, 0)::bigint AS cobrado_gs,
       CASE WHEN f.anulada_at IS NOT NULL THEN 0 ELSE f.monto_gs - coalesce(c.cobrado, 0) END::bigint AS saldo_gs,
       CASE WHEN f.anulada_at IS NOT NULL THEN 'ANULADA'
            WHEN coalesce(c.cobrado, 0) = 0 THEN 'PENDIENTE'
            WHEN coalesce(c.cobrado, 0) >= f.monto_gs THEN 'PAGADA'
            ELSE 'PARCIAL' END AS estado
FROM factura_cliente f
LEFT JOIN LATERAL (SELECT sum(a.monto_gs) AS cobrado FROM recibo_aplicacion a JOIN recibo r ON r.id = a.recibo_id
                   WHERE a.factura_id = f.id AND r.anulado_at IS NULL) c ON true;

-- 8. Permisos: nada se borra; facturas y recibos solo cambian en las columnas de anulación.
ALTER TABLE empresa_dato ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibo ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibo_aplicacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON empresa_dato, factura_cliente, recibo, recibo_aplicacion, v_factura_saldo FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON empresa_dato TO afull_api;
GRANT SELECT, INSERT ON factura_cliente, recibo, recibo_aplicacion TO afull_api;
GRANT UPDATE (anulada_at, anulada_por, motivo_anulacion) ON factura_cliente TO afull_api;
GRANT UPDATE (anulado_at, anulado_por, motivo_anulacion) ON recibo TO afull_api;
GRANT SELECT ON v_factura_saldo TO afull_api;
DROP POLICY IF EXISTS api_acceso ON empresa_dato;
CREATE POLICY api_acceso ON empresa_dato FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_acceso ON factura_cliente;
CREATE POLICY api_acceso ON factura_cliente FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_acceso ON recibo;
CREATE POLICY api_acceso ON recibo FOR ALL TO afull_api USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS api_select ON recibo_aplicacion;
CREATE POLICY api_select ON recibo_aplicacion FOR SELECT TO afull_api USING (true);
DROP POLICY IF EXISTS api_insert ON recibo_aplicacion;
CREATE POLICY api_insert ON recibo_aplicacion FOR INSERT TO afull_api WITH CHECK (true);
-- afull_respaldo (0025) las lee por los default privileges; se repite por si la base se armó antes de 0025.
GRANT SELECT ON empresa_dato, factura_cliente, recibo, recibo_aplicacion TO afull_respaldo;
