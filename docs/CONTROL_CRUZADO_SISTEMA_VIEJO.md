# Control cruzado: sistema viejo (`D:\sistema-afull-googleia`) vs sistema nuevo — 2026-11-10

> Revisión **de solo lectura** del código y la documentación del sistema viejo (React + Express + Prisma). Último commit del viejo: 2026-10-19; además tiene **54 cambios sin commitear** en disco (loops 8 a 19, del 24 al 27/10), que también se revisaron. **No se abrieron** los `.env` ni las planillas con datos reales (`PROYECTOS 2026 (2).xlsx`, `Kevin.xlsx`, `SOLICITUD DE PERMISO.docx`). Sin nombres de clientes en este documento.

## 1. Lo que ya se había cruzado
`docs/MAPA_REQUISITOS.md` ya tomó los requisitos de los documentos del viejo (`DOCUMENTO_ARQUITECTURA…`, `ARQUITECTURA_Y_AUDITORIA…`, minuta del 19/10: REQ-01 a REQ-07). Este control agrega lo que el viejo **programó** y no estaba en esos documentos, o que se resolvió distinto.

## 2. Diferencias de concepto (no son faltantes)
| Tema | Sistema viejo | Sistema nuevo |
| :--- | :--- | :--- |
| "Hoja de ruta" | Lista de tareas **de una OT** repartidas entre operarios (taller, diseño y calle), con categoría, cantidad y fotos. La armaba Gerardo. | Eso son las **tareas de la OT** (Agregar Tarea). La "hoja de ruta" nueva es solo la **salida** de la cuadrilla (paradas, vehículo, km). |
| Aprobación de diseños | 3 pasos en secuencia: Nachi → Sofi → Juan. | **Juan o Sofi**, cualquiera de los dos (corrección del usuario 2026-11-03). |
| Módulo de Edu (REQ-02) | Se hizo con máquinas y 6 fases; **Edu pidió simplificarlo** ("sería agregar más cosas al pedo"). Quedó: pendientes / terminadas, "Marcar como listo", plancha compartida. | Mi trabajo (reloj, material, merma, muestras) + Diseños → "Para producir". Coincide con lo que pidió Edu, salvo lo marcado en §3. |
| Horas | Registros sueltos con precio cargado a mano (`Registro`), editables. | Eventos inmutables (`tarea_intervalo`) y tarifa por persona; costo congelado al cerrar la OT. |

## 3. Lo que el viejo tenía y el nuevo NO tiene
| # | Función del viejo | Dónde estaba | Para quién | Prioridad sugerida |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Plancha compartida con reparto de horas de máquina**: una tanda para varios clientes reparte el tiempo **y** el material según los m² de cada uno | `ModuloImpresionesView`, `/api/operario/impresiones/lote-plancha/stop` | Edu | **Alta** (hoy el nuevo reparte solo el material; las horas caen en una sola OT) |
| 2 | **Carga o corrección manual de horas** (olvidó pausar, trabajó sin celular) | `RegistroManualForm`, `MisRegistros` (editar) | Oficina | **Alta** (ya detectado: falta definir con Juan) |
| 3 | **Reportes / pre-facturación** por cliente y rango de fechas (mano de obra, insumos, viajes, otros), **exportable a Excel** e imprimible | `Reportes.tsx` (xlsx) | Juan, Sofi | **Alta** (el nuevo tiene Rentabilidad por OT, sin exportar ni agrupar por cliente/período) |
| 4 | **Panel de Gerardo**: quién marcó entrada y **no está trabajando**, y **asignar e iniciar una tarea en vivo** | `PanelTrabajosActivos.tsx` | Gerardo | Media-alta |
| 5 | **Checklist de pasos dentro de una tarea**, con tiempo por paso, visible en vivo | `PanelTrabajosActivos`, `timer.routes` | Gerardo, operarios | Media (hoy se puede partir en varias tareas) |
| 6 | **Constancia de entrega**: foto de la remisión firmada, foto de la entrega, quién recibió y cuándo | `SubirFotoEntregaModal`, `Pedido.fotoRemisionUrl/fotoEntregaUrl/receptorNombre` | Cuadrilla, Sofi | Media (el nuevo tiene foto de montaje, sin remisión ni receptor) |
| 7 | **Asistencia de cuadrilla**: el conductor marca por todos los de la hoja; **marcación remota** (sale desde la casa con el camión) con motivo | `marcacion.routes.ts` (`HOJA_RUTA`, `REMOTO`) | Cuadrilla | Media |
| 8 | **Facturas de compra**: proveedor, número, cantidad comprada y usada; los consumos se descuentan de la factura | `facturasCompra.routes.ts`, `Registro.facturaCompraId` | Sofi | Media (el nuevo no lleva compras ni stock) |
| 9 | **Calculadora de adhesivo/lona en el presupuesto** (m² con merma y presets) | `CalculadoraAdhesivoModal.tsx` | Sofi | Media |
| 10 | **Portal: el cliente aprobaba o rechazaba el presupuesto** y veía montos; el pedido llevaba fecha tope y prioridad | `src/portal/PresupuestosPortal.tsx`, `PedidoHistorial` | Cliente | **Decisión del usuario** (el nuevo, por diseño, no muestra dinero en el portal) |
| 11 | **Mensaje de WhatsApp de la OT** (botón que arma el texto y abre WhatsApp) | `OrdenesTrabajoAdmin.tsx` | Sofi, Gerardo | Baja (barato) |
| 12 | **Dos precios de venta** en el presupuesto (`venta1` con margen y `venta2` a mano) | `PresupuestosAdmin.tsx` | Sofi | Baja (el nuevo tiene margen + "Fijar" precio final) |
| 13 | Tareas **terminadas / despachadas** visibles para el operario (historial propio) | `ModuloImpresionesView` (pestaña), `MisRegistros` | Edu, operarios | Baja-media |

## 4. Ya decidido, no se hace
- Importar Excel de partes diarios con IA y OCR de planillas en papel (REQ-07): descartado; solo el **script único de migración** de datos antes de producción.
- Archivado automático de pedidos a los 90 días: no hace falta (listas paginadas con filtro de estado y fechas).

## 5. Datos
El viejo tiene datos reales (clientes, carteras, proyectos, registros). La migración sigue siendo el script único con `--dry-run` antes de salir a producción. No se leyó ningún dato real en esta revisión.
