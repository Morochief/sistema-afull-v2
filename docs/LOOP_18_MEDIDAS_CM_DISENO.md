# Loop 18 — Edu carga medidas en centímetros y la medida total del material

> Reunión con Sofi, 2026-11-10 (notas en el chat del 17/11). Ejemplo real: un adhesivo de **137 × 691 cm** con piezas de varios trabajos (mc reservado 87 × 330, isla bob, isla kellogs 90 × 303, pl mogul 25 × 386).

## 1. Problema
- Edu mide en **centímetros**; Merma y Compartido piden **metros**: tiene que convertir a mano.
- Para un rollo usado en varios trabajos tiene dos ventanas distintas (Merma para uno, Compartido para varios) y Compartido no muestra el desperdicio.
- Lo que Edu anota es: la **medida total del material** que salió de la máquina y la **medida de cada pieza**. El desperdicio es la diferencia.

## 2. Qué ve Edu (una sola ventana: **Medidas**)
En la tarjeta de una tarea de máquina (impresión, ploteo, corte, refilado), el botón **Medidas** reemplaza a **Merma** y **Compartido**.
1. **Material**: buscar (ej. "Adhesivo"). Opcional: **Desperdicio con otro precio**.
2. **Medida del material usado (cm)**: **ancho** × **largo**. Botones rápidos de ancho: **137** y **152** (los rollos comunes).
3. **Trabajos**: arranca con la OT de la tarjeta (o con todas las OTs de su tanda, Loop 12). **+ Agregar otro trabajo** suma otra de sus OTs.
   Cada trabajo tiene sus **piezas**: ancho × alto (cm) × cantidad, y **+ pieza**.
4. Resumen en vivo:
   - Material 9,47 m² · Piezas 8,00 m² · **Desperdicio 1,46 m² (15,5 %)**
   - Por trabajo: sus m² de piezas y su parte del desperdicio.
   - Si las piezas suman más que el material: aviso en rojo y no deja cargar.
5. **Cargar**.

## 3. Cálculo (exacto, en `packages/shared/src/formulas/material.ts`)
- `calcularCorte(anchoCm, largoCm, trabajos[{ piezas[{anchoCm, altoCm, cantidad}] }])`. Centímetros con hasta 2 decimales; internamente m con 4 decimales (cm / 100).
- m² usados = ancho × largo; m² piezas de cada trabajo = Σ ancho × alto × cantidad.
- Desperdicio total = usados − Σ piezas (≥ 0, si no, error con los dos números).
- El desperdicio se reparte entre los trabajos **en proporción a sus m² de piezas** (`repartirCantidad`, Σ exacta).

## 4. Qué se guarda
Por cada trabajo, en su OT (mismo `grupo_id` para todo el corte):
- Una línea con sus **m² de piezas** del material.
- Una línea **desperdicio** (`es_desperdicio`) con su parte, con el insumo de desperdicio si se eligió.
- Nota: "Corte 137 × 691 cm · 4 trabajos · aprovechamiento 84,5 %".
Sin cambios de base de datos (usa `consumo_insumo`). La oficina lo ve como siempre en **Material usado** de cada OT, en m².

## 5. API
- `POST /api/insumos/corte` `{ insumoId, insumoDesperdicioId?, anchoCm, largoCm, trabajos: [{ otId, tareaId?, piezas: [{ anchoCm, altoCm, cantidad }] }], claveIdempotencia }`.
- 1 a 30 trabajos, sin OT repetida; OTs abiertas; insumos de unidad **M2** (si no, 400 "Este material no se mide en m²").
- Los endpoints `/merma` y `/compartido` siguen (compatibilidad), pero la tarjeta ya no los muestra.

## 6. Criterios de aceptación
- **CA-18.1** 137 × 691 cm con piezas 87 × 330 (OT A) y 90 × 303 (OT B): usados 9,4667 m²; A 2,871 m², B 2,727 m²; desperdicio 3,8687 m² repartido 2,871 : 2,727 entre A y B; Σ de todas las líneas = 9,4667.
- **CA-18.2** Un solo trabajo da lo mismo que la Merma de antes (en cm).
- **CA-18.3** Piezas que suman más que el material → 400 con "Las piezas suman X m² y el material Y m²".
- **CA-18.4** OT repetida, OT terminada, material que no es M2, medidas ≤ 0 → 400/409.
- **CA-18.5** Reintento con la misma clave no duplica.
- **CA-18.6** Recorrido Playwright en celular: Edu carga el ejemplo de la reunión en cm para 2 OTs, ve el desperdicio y su reparto; la oficina ve las líneas en m² en cada OT.

## 7. Decisiones del usuario (2026-11-17)
- Un trabajo puede tener una o varias piezas, y una tanda puede tener varias OTs.
- Los centímetros son solo para la carga de Edu; la oficina sigue viendo m².

## 8. L18.E2 — Un trabajo impreso en el desperdicio de otro (audio de Edu, 2026-11-17)
- Edu: "el adhesivo siempre es más que la impresión"; **pl mogul no está incluido en isla bob** (son trabajos distintos), pero **sale del desperdicio de bob**: "a Juan le sale gratis".
- En la ventana, cada trabajo tiene **Material: Usa material propio / Sale del desperdicio de OT-x**.
- El que sale del desperdicio: no suma m² de piezas ni paga desperdicio; su OT recibe una línea con sus m² **a Gs. 0** y la nota "aprovecha el desperdicio de OT-x". Debe ser ≤ que el trabajo del que sale; no puede salir de otro que también sale de un desperdicio.
- Ejemplo real: 137 × 691 cm con mc 87 × 330, bob 46 × 686, kellogs 90 × 303 y mogul 25 × 386 (de bob): piezas 8,7536 m², desperdicio 0,7131 m² (92,5 %), repartido 0,2339 / 0,257 / 0,2222.
- La oficina ve la nota de cada línea en **Material usado** de la OT.
- Decisión del usuario (17/11): tilde "Sale del desperdicio" (no paga material, queda anotado).
