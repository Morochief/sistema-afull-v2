# Loop 8 — RR.HH.: permisos y asistencia (diseño de Claude Code)

> **Estado:** IMPLEMENTADO por Claude Code el 2026-11-03, sin commit. Migración `0015_permisos.sql`.

## 0. Base: el formulario de papel de la empresa
Tipos legales (retiro anticipado, llegada tarde, estudio, salud, nacimiento, matrimonio, fallecimiento de familiar directo, defunción, maternidad/lactancia, obligación legal, otro), **motivo obligatorio**, **por horas** (un día, desde/hasta) o **por días**, comprobante cuando corresponde (salud, nacimiento, citación judicial), presentación **dentro de las 24 h**, firmas del **solicitante**, del **jefe inmediato** y de **RR.HH.**, y RR.HH. decide si **se descuenta del salario**.

## 1. Flujo (máquina en `packages/shared/src/machines/permiso.ts`)
`PENDIENTE → AUTORIZADA (jefe = admin) → REGISTRADA (RR.HH., con descuento sí/no)`.
`RECHAZADA` (jefe o RR.HH., con motivo) desde PENDIENTE o AUTORIZADA. `ANULADA` solo por quien la pidió/cargó y solo PENDIENTE. REGISTRADA, RECHAZADA y ANULADA son finales.
- Cada cambio usa `FOR UPDATE` y exige `desde` (409 si cambió).
- **Firmas** = `solicitud_permiso_evento`, inmutable (quién, cuándo, comentario, descuento).
- `solicitud_permiso`: lo cargado no se modifica (trigger); solo cambian estado y descuento, y nunca desde un final. Número `PER-AAAA-0001` con `siguiente_valor()` en la misma transacción. Idempotente por clave.
- **Fuera de plazo** (> 24 h desde el inicio del permiso): se marca, no se bloquea; RR.HH. decide.
- **Comprobante:** por ahora un **enlace** (Drive, foto compartida). Si el tipo lo requiere y falta, se avisa. La subida de archivos llega con el almacenamiento (Loop 4, L4.E3), que sirve también para fotos de odómetro y evidencias.

## 2. Alcance
- Cualquiera con persona vinculada pide para sí. **RR.HH. puede cargar a nombre de otra persona** (formulario en papel).
- Cada uno ve **solo lo suyo**; el jefe (admin) y RR.HH. ven todo.

## 3. API
`GET /api/permisos` (25 por página: q, estado, rango de fechas del permiso) · `GET /api/permisos/:id` (con firmas y `es_propia`) · `POST /api/permisos` · `POST /api/permisos/:id/transicionar`.
`GET /api/asistencia` ahora acepta `q` (nombre de la persona).

## 4. Pantallas
- **Permisos** (menú para todos): listado estándar, "Pedir permiso" (formulario como el de papel), detalle con firmas y las acciones que le tocan a quien mira.
- **Asistencia** (RR.HH.): marcaciones con buscador, filtro "fuera de la sede" y fechas. "Fuera" es aviso, no falta (geocerca disuasiva).

## 5. Pruebas
`tests/loop8/permisos-api.test.ts` (reglas puras y CA-8.1 a CA-8.3) · `scripts/prueba-loop8.cjs` 6/6.

## 6. Supuestos a confirmar
1. El **jefe inmediato** es quien tiene `admin` (Juan). Si hay jefes por área, se agrega "jefe" a la persona.
2. RR.HH. registra el **descuento sí/no**; el cálculo del descuento en sueldos queda fuera (no hay liquidación en el sistema).
3. Plazo de 24 h contado desde el **inicio** del permiso.
