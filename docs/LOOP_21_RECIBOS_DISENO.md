# Loop 21: recibos de dinero y cobranzas (como el de Prosegur)

> Pedido de Juan (audios del 11/11, confirmado el 18/11): "el recibo electrónico", con el ejemplo del **Recibo de Dinero de Prosegur** (PDF con número propio, sin CDC ni QR). **No es el recibo electrónico del SIFEN**: ese lo emitiría su sistema de facturación si el contador lo pide. El recibo de dinero no lleva timbrado (consulta de la DNIT), pero sirve como prueba del pago de una factura.

## 1. Qué resuelve
Hoy Juan factura con su sistema electrónico, pero no tiene dónde registrar **qué le pagaron, de qué factura, ni qué le falta cobrar**, ni cómo entregar un recibo prolijo. El loop agrega:
1. **Facturas a cobrar.** La oficina carga la factura que ya emitió (número `001-001-0236175`, fecha, cliente, monto con IVA y, si quiere, la OT o el proyecto). El sistema **no factura**.
2. **Recibo.** Cuando el cliente paga: cuánto, cómo (medio, banco, referencia), qué facturas cancela (una o varias, total o parcial) y si le retuvieron algo. Sale un **recibo numerado** con el formato del de Prosegur.
3. **Saldo.** Cada factura muestra lo pagado y lo que falta; cada cliente, su total pendiente.
4. **Portal.** El cliente ve sus recibos y puede abrir cada uno para imprimirlo o guardarlo en PDF.

## 2. Supuestos (Juan respondió solo la primera pregunta; los demás se pueden cambiar sin rehacer nada)
| Tema | Supuesto | Por qué |
| :--- | :--- | :--- |
| Numeración | `REC-2026-0001`, correlativa por año, con `siguiente_valor` en la misma transacción | Igual que OT, presupuestos y permisos; si Juan usa otra, se cambia el prefijo |
| Moneda | **Solo guaraníes** (`BIGINT`) | Regla del proyecto; no hay facturas en dólares a la vista. El recibo dice "Guaraníes X" |
| Medios | Efectivo, Transferencia, Cheque, Tarjeta, Billetera/Tpago, Débito automático, Otro; con banco y referencia opcionales | Los del ejemplo y los usuales |
| Retenciones | Monto opcional y número de comprobante de retención | Prosegur muestra "Importe Retenciones"; lo aplicado a facturas = importe + retenciones |
| Cobrador | El nombre de quien emite el recibo (su persona o, si no tiene, su usuario), congelado en el recibo | "Cobrador Autorizado" del ejemplo |
| Quién usa | Capacidad `comercial` (Sofi; Juan y Gerardo son admin) | Lo mismo que pre-factura |
| Datos de aFull | Una fila editable: razón social, RUC, dirección, ciudad, teléfono y mail. Los carga un admin una vez | El encabezado del recibo; sin RUC no hay recibo serio |

## 3. Base (migración `0026_recibos`)
- `empresa_dato` (una sola fila, `id = 1`): `razon_social`, `ruc`, `direccion`, `ciudad`, `telefono`, `email`, `updated_at`, `updated_por`. `afull_api` puede `SELECT`, `INSERT` y `UPDATE`; la API exige `admin`.
- `factura_cliente`:
  - columnas: `numero` (`^\d{3}-\d{3}-\d{7}$`, **único**), `cliente_id`, `fecha`, `monto_gs > 0`, `orden_trabajo_id` y `proyecto_id` opcionales, `nota`, `creado_por`, `created_at`, y para anularla `anulada_at`, `anulada_por`, `motivo_anulacion`;
  - `UNIQUE (id, cliente_id)` para la FK compuesta;
  - **`UPDATE` solo en las tres columnas de anulación** (permiso por columna) y nada de `DELETE`.
- `recibo`:
  - columnas: `numero` único, `cliente_id`, `fecha`, `importe_gs > 0`, `retenciones_gs >= 0`, `retencion_numero`, `medio` (CHECK), `banco`, `referencia`, `nota`, `cobrador_nombre` (congelado), `emitido_por`, `created_at`, `clave_idempotencia` (única), y la anulación igual que la factura;
  - mismo esquema de permisos.
- `recibo_aplicacion` (`recibo_id`, `factura_id`, `cliente_id`, `monto_gs > 0`, PK de recibo + factura):
  - **FK compuestas** a `(recibo.id, cliente_id)` y `(factura_cliente.id, cliente_id)`: la base no deja aplicar un recibo a la factura de otro cliente;
  - solo se lee y se agrega (`SELECT`, `INSERT`), con el trigger de inmutabilidad.
- **Trigger** al agregar una aplicación: lo aplicado a la factura por recibos **vigentes** no puede pasar su monto, y no se puede aplicar a una factura anulada. Restricción dura en PostgreSQL.
- Vista `v_factura_saldo`: cada factura con `cobrado_gs` (solo recibos no anulados), `saldo_gs` y `estado` (PENDIENTE, PARCIAL, PAGADA o ANULADA).

## 4. API (`/api/cobranzas`, `comercial`; los datos de aFull, `admin`)
- `GET` y `PUT /empresa`.
- `GET /facturas`:
  - filtros por cliente, estado, búsqueda por número y rango de fechas;
  - 25 por página, con saldo;
  - totales: facturado, cobrado y pendiente.
- `POST /facturas` (número repetido: 409) y `POST /facturas/:id/anular { motivo }` (409 si tiene cobros vigentes).
- `GET /recibos` (filtros y 25 por página) y `GET /recibos/:id`: el recibo, sus aplicaciones con número de factura, el cliente con RUC y los datos de aFull.
- `POST /recibos { clienteId, fecha, medio, banco?, referencia?, retencionesGs?, retencionNumero?, aplicaciones:[{facturaId, montoGs}], nota?, claveIdempotencia }`:
  - `importe = Σ aplicaciones − retenciones` (> 0);
  - bloquea las facturas (`FOR UPDATE`), valida que sean del cliente, que no estén anuladas y que el monto no pase el saldo;
  - número `REC-AAAA-NNNN` y auditoría en la misma transacción; reintento con la misma clave: el mismo recibo.
- `POST /recibos/:id/anular { motivo }`: el saldo de sus facturas vuelve.
- `GET /clientes/:id/saldo`.
- Portal: `GET /api/portal/recibos` (los de su cliente) y `GET /api/portal/recibos/:id`. Solo lo que figura en el recibo: sin notas internas ni quién lo emitió.

## 5. Web
- Menú **Cobranzas** (comercial), con pestañas:
  - **Facturas:** buscador, estado, fechas, saldo y **Registrar factura**.
  - **Recibos:** lista con **Nuevo recibo**.
  - **Datos de aFull:** solo admin. Si faltan, avisa arriba en naranja.
- **Nuevo recibo:**
  1. Se elige el cliente y aparecen sus facturas con saldo, con tilde e importe (por defecto, el saldo).
  2. Se completan medio, banco, referencia, retenciones y fecha.
  3. Se muestran el total aplicado, el importe recibido y **el monto en letras**.
  4. Al guardar se abre la hoja para imprimir.
- **Hoja A4** (`/cobranzas/recibos/:id/imprimir`, fuera del menú), como la de Prosegur:
  - encabezado de aFull con RUC, "RECIBO DE DINERO", número y RUC;
  - "Recibimos de", el RUC/C.I. del cliente, "Guaraníes X", "en (medio)", "c/Banco", "El importe de" y **la suma en letras**;
  - "Importe Retenciones", la tabla Factura/Nº – Guaraníes, el TOTAL, "Lugar y Fecha" y "Cobrador Autorizado";
  - si está anulado: marca de agua **ANULADO**.
  - El portal usa la misma hoja.
- En la ficha del cliente, una línea: "Saldo pendiente: Gs. X (N facturas)".

## 6. Criterios de aceptación
- **CA-21.1** Registrar una factura; el número repetido o mal formado da 409/400; anularla con un cobro vigente da 409.
- **CA-21.2** Un recibo aplicado a 2 facturas (una total y otra parcial) con retención:
  - importe = aplicado − retención;
  - las facturas quedan PAGADA y PARCIAL;
  - el saldo del cliente baja;
  - el número es `REC-AAAA-NNNN` y es correlativo;
  - el reintento con la misma clave no duplica.
- **CA-21.3** Pasar el saldo da 400; aplicar a una factura de otro cliente lo rechaza la base (FK); dos recibos al mismo tiempo sobre la misma factura no la pasan (trigger + `FOR UPDATE`).
- **CA-21.4** Anular un recibo devuelve el saldo y el recibo sigue existiendo marcado como anulado. `UPDATE` de otra columna o `DELETE` desde `afull_api` da 42501.
- **CA-21.5** El monto en letras es correcto, por ejemplo 321.499 → "trescientos veintiún mil cuatrocientos noventa y nueve guaraníes" (con casos de borde: 1, 100, 1.000.000, 21.000).
- **CA-21.6** En el portal, el cliente ve solo sus recibos, sin notas internas ni quién lo emitió; el de otro cliente da 404.
- **CA-21.7** Taller y montaje reciben 403 en `/api/cobranzas`.
- **CA-21.8** Recorrido: Sofi carga los datos de aFull y 2 facturas, hace un recibo por transferencia con retención, lo imprime (los datos y el monto en letras coinciden), lo anula y el saldo vuelve; el cliente lo ve en su portal.

## Ajustes al implementar (18/11)

- `cliente` no tiene dirección: el recibo muestra nombre y RUC del cliente (como el de Prosegur).
- Facturas: el filtro por defecto es "Con saldo" (PENDIENTE + PARCIAL); "Todas" las muestra a todas.
- El recibo para ver e imprimir es `/cobranzas/recibos/:id` (fuera del menú, como el presupuesto imprimible). Desde ahí se anula.
- `CA-21.7` deja `empresa_dato` como estaba (en `dev` puede haber datos reales de aFull); el recorrido también.
