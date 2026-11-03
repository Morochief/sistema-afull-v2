# Loop 7 — Diseño y verificación (Claude Code, 2026-11-03)

> **Estado:** IMPLEMENTADO por Claude Code, sin commit. Se adelantó a pedido del usuario (el dolor diario: Edu pregunta en el grupo "¿la ruleta ya tienen?" y el enlace del Drive se pierde en WhatsApp).
> **Fuente:** el usuario y Sofi, 2026-11-03 (reemplaza el REQ-06 del sistema viejo, que planteaba Nachi → Sofi → Juan en secuencia).

## 0. Cómo trabajan (confirmado)
- El diseño lo trae **el cliente** o lo hace **Nachi** (diseñadora externa que registra su tiempo como todos: tarea `DISENO` con cronómetro).
- El archivo original vive en **Google Drive**. El sistema guarda solo el enlace.
- **Todo** diseño, también el del cliente, lo verifica **Juan o Sofi** (cualquiera) — "sí o sí, medidas y demás".
- Recién aprobado, **Edu** lo ve y abre el original para producir.

## 1. Modelo (`0011_iva_disenos.sql`, parte B)
`diseno_version`: OT, `version` (única por OT), `origen` (`CLIENTE`/`DISENADORA`), `drive_url` (`CHECK` solo `drive.google.com` / `docs.google.com`), notas, quién y cuándo subió, `estado` (`PENDIENTE` → `APROBADO` u `OBSERVADO`, con observación obligatoria), quién y cuándo revisó.
- **Una sola versión pendiente por OT** (índice único parcial).
- Una versión se revisa **una vez** y queda inmutable (trigger); sin `DELETE`.

## 2. API `/api/disenos`
- `GET /ot/:otId` (comercial, taller, diseno) · `POST /ot/:otId` subir (comercial: cliente o diseñadora; `diseno`: solo como diseñadora y solo en OTs donde tiene una tarea `DISENO`).
- `GET /pendientes` y `POST /:id/aprobar|observar` (comercial; admin pasa siempre → Juan y Sofi).
- `GET /cola` (taller, comercial): OTs abiertas cuya **última** versión está aprobada. Si se sube otra versión, la OT sale de la cola hasta que se apruebe.

## 3. Pantallas
- **Detalle de OT:** sección "Diseño" con versiones, "Abrir en Drive", Aprobar (medidas verificadas) / Observar, y "Cargar diseño".
- **Mi trabajo:** en tareas de diseño, botón "Cargar enlace del diseño" (Nachi no entra a OTs).
- **/disenos:** "Por verificar" (Juan y Sofi) y "Para producir" (Edu), se refresca cada 30 s.

## 4. Pruebas
`tests/loop7/disenos-api.test.ts` (flujo, observación + v2, permisos, motor) y `scripts/prueba-loop7.cjs` (Nachi → Edu no lo ve → Sofi aprueba → Edu lo abre: 5/5 en local).

## 5. Pendiente
- Avisos (notificación a Edu cuando se aprueba; a Nachi cuando se observa): hoy se ve al entrar o en 30 s.
