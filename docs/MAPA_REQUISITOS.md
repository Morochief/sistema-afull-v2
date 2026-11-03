# Mapa de requisitos del negocio → loops

> **Fuente:** documentos del sistema anterior (`DOCUMENTO_ARQUITECTURA_SISTEMA_AFULL.md` v2.5 y `ARQUITECTURA_Y_AUDITORIA_SISTEMA_AFULL.md`, incluida la minuta de la reunión del 19/10/2026 con Sofi, Gerardo, Edu, Nachi y Juan). El código viejo no se reutiliza; **sus requisitos sí**.
> **Regla:** todo requisito tiene un loop asignado o está marcado como descartado, con motivo. Nada queda "en el aire".
> **Actualizado:** 2026-11-02 por Claude Code, con decisiones del usuario.

## Orden de loops (decisión del usuario, 2026-11-02)

`0 Base → 1 Clientes + OT → 2 Tareas y cronómetro → 3 Comercial → 4 Campo y flota → 5 Stock → 6 Costeo → 7 Pre-prensa → 8 RR.HH. → 9 Portal B2B`

Cambio respecto de `TRASPASO.md` §6: entra **3 Comercial** (presupuesto y proyecto, que no tenían loop) y los demás se corren un lugar.

## Decisiones de negocio del circuito comercial (usuario, 2026-11-02)

1. **Tres caminos:** OT directa (urgencias, mantenimiento, sin presupuesto: REQ-05); presupuesto → 1 OT; presupuesto con varios locales → proyecto + N OTs (una por sucursal).
2. **Aprobación todo o nada, con versiones.** Si el cliente aprueba 3 de 5 locales, se hace una v2 con los 3 y se aprueba entera; la v1 queda en el historial.
3. **El diseño previo para vender no se registra** por ahora (pasa poco).
4. **No hay tabla `pedido` para el trabajo interno:** Comercial abre directamente un presupuesto en borrador. `pedido` llega con el portal (Loop 9), donde el cliente carga por local.

## Personas y roles (usuario, 2026-11-03)
- **Juan:** dueño de aFull (capacidad `admin`). Aprueba diseños.
- **Sofi:** administración y comercial (`comercial`, `rrhh`). Aprueba diseños.
- **Edu:** taller, impresión y corte (`taller`). Abre el diseño aprobado en Drive.
- **Nachi:** diseñadora externa que trabaja con ellos; diseña solo cuando el cliente no trae diseño. **Registra su tiempo como todos** (hoy: "Acción: … / Cliente: …" y "fin" en su planilla, confirmado por Sofi 2026-11-03): usuario con capacidad `diseno`, persona con tarifa, cronómetro en "Mi trabajo" sobre tareas tipo `DISENO` (migración `0010`). Sube el original a Drive y hoy avisa a Edu por el grupo de WhatsApp "Impresiones / Cortes".
- **Verificación obligatoria (Sofi):** todo diseño, **también el que trae el cliente**, lo verifica Juan o Sofi ("sí o sí, medidas y demás") antes de que Edu lo produzca.

## Hallazgos de las planillas reales (2026-11-03; los archivos NO van al repo)
- **Precio:** costo ÷ 0,70 (margen 30 % sobre la venta) en la gran mayoría de los proyectos; a veces ×1,30; luego redondeo manual → implementado en `0012`.
- **Mano de obra por minuto** con tarifa por persona (casi todos igual) → encaja con `tarifa_persona`.
- **Juan y Sofi cargan tiempo** de presupuesto y relevamiento a los proyectos → `comercial` usa "Mi trabajo" (`0012`).
- **Procesos más usados:** ploteo, retiro, montaje, entrega, corte, carga/descarga, diseño, presupuesto, preparación, fabricación, relevamiento, colocación, limpieza, armado, lijado, compra, refilado, control, enfilado, pintura, tensado, reparación → catálogo `tipo_tarea` (`0012`), administrable por Juan.
- **Insumos:** ~260 ítems con costo y unidad (unidad, metro, m², plancha, litro, rollo, lata, kg…) por sector (carpintería, herrería, impresiones, láser, pinturería, electricidad, ploteo). Ya anotan el **desperdicio** como línea aparte. Combustible se carga por litro. → base para el Loop 5 (normalizar unidades al importar).
- **Solicitud de permiso:** formulario con tipos de licencia legales (nacimiento, matrimonio, salud, estudio, etc.) y firma del jefe → Loop 8.

## Matriz

| Requisito (origen) | Loop | Estado |
| :--- | :--- | :--- |
| Pausar y saltar entre tareas sin perder tiempo (REQ-01) | 2 | ✅ Hecho (`tarea_intervalo`, auto-pausa) |
| Permisos por capacidad, sin cédulas fijas en el código (P2-02) | 0 | ✅ Hecho |
| OT sin presupuesto obligatorio (REQ-05) | 1 | ✅ Hecho |
| Control en vivo de quién trabaja en qué | 2 | ✅ Hecho |
| Presupuesto con ítems, margen e impresión/PDF | 3 | ✅ Implementado (sin commit) |
| Proyecto como contenedor de varias OTs (campañas multi-local) | 3 | ✅ Implementado (sin commit) |
| Presupuestado vs. real por OT y por proyecto | 3 (presupuestado) + 6 (real) | Diseñado |
| Hoja de ruta diaria con paradas y cuadrilla | 4 | ✅ Base, API y pantallas (sin commit las pantallas) |
| Viajes: odómetro con foto, GPS, alerta de desvío informativa | 4 | ✅ Odómetro, GPS y alerta con pantallas; foto pendiente (Storage) |
| Asistencia con geocerca de 100 m (disuasiva) | 4 | ✅ Base, API, marcación en "En la calle" y pantalla de RR.HH. (Loop 8) |
| Fotos de evidencia de montaje y **muestras de impresión antes del despacho** (REQ-03, McDonald's) | 4 | Planificado: la infraestructura de fotos (URLs firmadas, bucket privado) se hace una vez y sirve para odómetro, montaje y muestras de tarea |
| Trabajo offline de cuadrillas | 4 | Planificado |
| Insumos (catálogo con historial de precios) y consumo por OT — **sin stock** por decisión del usuario | 5 | ✅ Base, API e importador (sin commit); faltan pantallas |
| Cálculo automático de aprovechamiento y merma por medidas (REQ-04) | 5 | ✅ Fórmula y API (`/api/consumos/merma`); falta la calculadora en pantalla |
| Prorrateo de planchas o bobinas compartidas entre varios clientes/OTs | 5 | ✅ Fórmula y API (`/api/consumos/compartido`); falta la pantalla |
| Costeo real (horas × tarifa + insumos + km) y prefactura con margen | 6 | Planificado (snapshot al cierre de la OT) |
| Aprobación de diseños (REQ-06, **corregido por el usuario 2026-11-03**): el diseño puede venir del cliente o de Nachi; queda en Google Drive; **Juan o Sofi** (cualquiera de los dos) dan el OK; recién ahí Edu ve el enlace (hoy Edu pregunta en el grupo "¿la ruleta ya tienen?": eso lo resuelve la cola) | 7 | ✅ Implementado (sin commit): `docs/LOOP_7_DISENO.md` |
| Botón "Abrir original en Drive" para Edu | 7 | ✅ Implementado (sin commit) |
| Permisos y justificaciones con comprobante (RR.HH.) | 8 | ✅ Implementado (sin commit): `docs/LOOP_8_DISENO.md`; comprobante por enlace hasta tener almacenamiento |
| Portal del cliente por enlace, pedidos por local con foto | 9 | ✅ Implementado (sin commit): `docs/LOOP_9_DISENO.md`; foto por enlace hasta tener almacenamiento |
| Pantalla propia de impresión y corte para Edu (REQ-02) | — | **A revisar con Edu después de usar "Mi trabajo"** del Loop 2. Si hace falta, entra como entrega extra del Loop 5 (cola por máquina) |
| Importar planillas de papel por foto con IA (REQ-07) | — | **Descartado por ahora:** costo y fiabilidad; el operario carga en el celular en el momento |
| Importar Excel de partes diarios (sistema viejo) | — | **Descartado como función:** solo el script único de migración de datos (`--dry-run`) antes de salir a producción |
| Facturación fiscal (SIFEN) | — | Fuera de alcance: aFull hace prefactura; la factura legal sale del sistema contable |
