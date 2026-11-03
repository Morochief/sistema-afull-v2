-- MIGRACIÓN 0008: blindaje del circuito comercial (auditoría Claude Code de L3.E1)
-- 0007 ya está aplicada en afull-dev: las correcciones van en una migración nueva, no editando 0007.

-- 1. OT: presupuesto_id y monto no se pueden vaciar (con `<>`, NULL esquivaba el control).
CREATE OR REPLACE FUNCTION fn_ot_presupuesto_inmutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.presupuesto_id IS NOT NULL AND NEW.presupuesto_id IS DISTINCT FROM OLD.presupuesto_id THEN
    RAISE EXCEPTION 'No se puede modificar el presupuesto_id de una OT una vez asignado' USING ERRCODE = '23514';
  END IF;
  IF OLD.monto_presupuestado_gs IS NOT NULL AND NEW.monto_presupuestado_gs IS DISTINCT FROM OLD.monto_presupuestado_gs THEN
    RAISE EXCEPTION 'No se puede modificar el monto_presupuestado_gs de una OT una vez asignado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Ítems: se valida el presupuesto de ORIGEN y el de destino, y se bloquea la cabecera con
--    FOR SHARE para que un ítem no se cuele mientras otra transacción envía el presupuesto.
CREATE OR REPLACE FUNCTION fn_presupuesto_item_solo_borrador()
RETURNS TRIGGER AS $$
DECLARE
  v_estado VARCHAR(30);
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.presupuesto_id IS DISTINCT FROM OLD.presupuesto_id
                           OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id) THEN
    RAISE EXCEPTION 'Un ítem no puede cambiar de presupuesto ni de cliente' USING ERRCODE = '23514';
  END IF;
  SELECT estado INTO v_estado FROM presupuesto WHERE id = NEW.presupuesto_id FOR SHARE;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Presupuesto no encontrado' USING ERRCODE = '23503';
  END IF;
  IF v_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'No se pueden agregar o modificar ítems de un presupuesto que no está en BORRADOR (estado actual: %)', v_estado USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Cabecera: fuera de BORRADOR solo cambia `estado` (y updated_at); en estado final, nada.
CREATE OR REPLACE FUNCTION fn_presupuesto_congelado()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IN ('APROBADO', 'RECHAZADO', 'REEMPLAZADO', 'ANULADO') THEN
    RAISE EXCEPTION 'El presupuesto está en estado final (%) y no se puede modificar', OLD.estado USING ERRCODE = '23514';
  END IF;
  IF OLD.estado <> 'BORRADOR' AND (
       NEW.numero IS DISTINCT FROM OLD.numero OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.titulo IS DISTINCT FROM OLD.titulo
    OR NEW.notas IS DISTINCT FROM OLD.notas OR NEW.margen_pct IS DISTINCT FROM OLD.margen_pct
    OR NEW.validez_dias IS DISTINCT FROM OLD.validez_dias OR NEW.total_gs IS DISTINCT FROM OLD.total_gs
    OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
    OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Presupuesto %: fuera de BORRADOR solo puede cambiar de estado', OLD.estado USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presupuesto_congelado ON presupuesto;
CREATE TRIGGER trg_presupuesto_congelado BEFORE UPDATE ON presupuesto
  FOR EACH ROW EXECUTE FUNCTION fn_presupuesto_congelado();

-- 4. Total no negativo.
ALTER TABLE presupuesto DROP CONSTRAINT IF EXISTS chk_presupuesto_total_no_negativo;
ALTER TABLE presupuesto ADD CONSTRAINT chk_presupuesto_total_no_negativo CHECK (total_gs IS NULL OR total_gs >= 0);

-- 5. Total obligatorio solo en los estados que pasaron por el envío. El CHECK de 0007
--    (`estado = 'BORRADOR' OR total_gs IS NOT NULL`) impedía ANULAR un borrador (total NULL).
ALTER TABLE presupuesto DROP CONSTRAINT IF EXISTS presupuesto_check;
ALTER TABLE presupuesto DROP CONSTRAINT IF EXISTS chk_presupuesto_total_enviado;
ALTER TABLE presupuesto ADD CONSTRAINT chk_presupuesto_total_enviado
  CHECK (estado IN ('BORRADOR', 'ANULADO') OR total_gs IS NOT NULL);
