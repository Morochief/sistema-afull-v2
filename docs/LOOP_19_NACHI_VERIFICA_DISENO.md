# Loop 19 — Nachi verifica su diseño y lo corrige sin esperar a la oficina

> Reunión con Sofi, 2026-11-10 (notas en el chat del 17/11).

## 1. Problema
- Hoy Nachi sube el enlace y la versión queda **por verificar** hasta que Juan o Sofi la aprueban. Edu no puede producir mientras tanto.
- Si Edu encuentra un error en un diseño ya aprobado, o Nachi se equivoca de enlace, ella necesita una autorización para corregirlo.

## 2. Qué cambia para Nachi (en su tarjeta de Mi trabajo)
- Al cargar el enlace hay un tilde **"Ya lo verifiqué (medidas, textos y colores)"**. Tildado, la versión queda **Aprobada por la diseñadora** y Edu la ve enseguida en Diseños.
- Si la subió sin tildar, la tarjeta muestra **Marcar como verificado** sobre su versión pendiente.
- **Subir versión corregida** con un **motivo** ("Edu vio un error en el teléfono"):
  - si la versión anterior estaba pendiente, queda **Anulada** (reemplazada por la nueva);
  - si estaba aprobada, queda en el historial; Edu deja de ver la OT hasta que la nueva esté verificada (siempre manda la última versión).
- La tarjeta muestra el estado de su última versión (v2 · aprobada por vos · 10:40).

## 3. La oficina sigue pudiendo frenar
- Juan, Gerardo o Sofi pueden **Observar** una versión **aprobada por la diseñadora** (con motivo): pasa a Observada, Edu deja de verla y Nachi sube otra.
- Una versión aprobada por la oficina no se observa después (como hoy).

## 4. Modelo (migración `0021_diseno_autoverificacion`)
- `diseno_version.estado` suma `'ANULADA'`; columnas `anulada_por`, `anulada_at`, `motivo_anulacion`, `observado_por`, `observado_at`.
- `autoverificada BOOLEAN NOT NULL DEFAULT false`: true cuando quien aprobó es quien la subió como diseñadora.
- Trigger de revisión: además de PENDIENTE → APROBADO | OBSERVADO, permite PENDIENTE → ANULADA y APROBADO (autoverificada) → OBSERVADO, una vez; nada más cambia.
- `motivo_cambio TEXT` en la versión nueva (por qué se reemplazó la anterior).

## 5. API
- `POST /api/disenos/ot/:otId` acepta `verificada: true` y `motivoCambio`. Una diseñadora con una versión **suya** pendiente puede subir otra: la pendiente queda ANULADA en la misma transacción.
- `POST /api/disenos/:id/verificar`: la diseñadora sobre su versión pendiente (o Comercial) → APROBADO.
- `POST /api/disenos/:id/observar`: Comercial, sobre PENDIENTE o APROBADO autoverificada.
- `GET /api/mi-trabajo`: la tarea de diseño trae `ultima_version` { version, estado, autoverificada, revisado_at }.

## 6. Criterios de aceptación
- **CA-19.1** Nachi sube con "Ya lo verifiqué": la versión queda APROBADO autoverificada y la OT entra en la cola de Edu.
- **CA-19.2** Nachi marca como verificada su pendiente; no puede verificar una versión que subió otro (403).
- **CA-19.3** Nachi sube una corregida con una pendiente suya: la anterior queda ANULADA con el motivo; la nueva es la única pendiente.
- **CA-19.4** Corregida sobre una aprobada: la OT sale de la cola de Edu hasta que la nueva se verifique.
- **CA-19.5** La oficina observa una autoverificada: OBSERVADO, sale de la cola; una aprobada por la oficina no se puede observar (409).
- **CA-19.6** Las versiones no se borran (trigger); una ANULADA no cambia más.
- **CA-19.7** Recorrido Playwright: Nachi (celular) sube y verifica → Edu la ve en Diseños → Nachi sube la corregida → Edu ve la v2.

## 7. Decisiones del usuario (2026-11-17)
- La oficina puede observar después lo que Nachi verificó.
