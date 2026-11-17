/**
 * Fórmulas de material (Loop 5), exactas con BigInt (medidas en metros con hasta 4 decimales).
 * - Merma de bobina/rollo (REQ-04): el operario carga el ancho del material, cuánto usó de largo y las piezas;
 *   el sistema calcula m² usados, m² de piezas, desperdicio y aprovechamiento. Sin hacer cuentas a mano.
 * - Plancha compartida: un material repartido entre varias OTs en proporción a los m² de piezas de cada una.
 */
import { aEscalado, type Decimal } from './presupuesto.js';

export type Pieza = { anchoM: Decimal; altoM: Decimal; cantidad: number };

const E4 = 10_000n;

/** Redondea un valor escala 8 a escala 4 (mitad hacia arriba) y lo devuelve como número de 4 decimales. */
function a4(v8: bigint): number {
  const q = v8 / E4;
  const r = v8 % E4;
  return Number(r * 2n >= E4 ? q + 1n : q) / 10_000;
}

export type ResultadoMerma = {
  m2Usados: number;
  m2Piezas: number;
  m2Desperdicio: number;
  aprovechamientoPct: number;
};

export function calcularMerma(anchoMaterialM: Decimal, largoUsadoM: Decimal, piezas: readonly Pieza[]): ResultadoMerma {
  const usados8 = aEscalado(anchoMaterialM, 4) * aEscalado(largoUsadoM, 4);
  let piezas8 = 0n;
  for (const p of piezas) {
    if (!Number.isInteger(p.cantidad) || p.cantidad < 1) throw new Error('La cantidad de piezas tiene que ser un entero ≥ 1');
    piezas8 += aEscalado(p.anchoM, 4) * aEscalado(p.altoM, 4) * BigInt(p.cantidad);
  }
  if (usados8 <= 0n) throw new Error('El material usado tiene que ser mayor a 0');
  if (piezas8 > usados8) throw new Error('Las piezas suman más superficie que el material usado: revisá las medidas');
  // Aprovechamiento con 1 decimal: piezas / usados × 100.
  const pct10 = (piezas8 * 1000n * 2n + usados8) / (usados8 * 2n);
  return {
    m2Usados: a4(usados8),
    m2Piezas: a4(piezas8),
    m2Desperdicio: a4(usados8 - piezas8),
    aprovechamientoPct: Number(pct10) / 10,
  };
}

/**
 * Reparte `cantidadTotal` (escala 4) entre partes proporcionales a `pesos` (m² de piezas de cada OT).
 * El resto del redondeo se ajusta en la parte de mayor peso: Σ = cantidadTotal exacto.
 */
export function repartirCantidad(cantidadTotal: Decimal, pesos: readonly Decimal[]): number[] {
  const total4 = aEscalado(cantidadTotal, 4);
  const p8 = pesos.map((p) => aEscalado(p, 8));
  const suma = p8.reduce((a, b) => a + b, 0n);
  if (total4 <= 0n || suma <= 0n || p8.some((p) => p <= 0n)) throw new Error('Cantidades y pesos tienen que ser mayores a 0');
  const partes = p8.map((p) => {
    const n = total4 * p;
    const q = n / suma;
    return (n % suma) * 2n >= suma ? q + 1n : q;
  });
  const dif = total4 - partes.reduce((a, b) => a + b, 0n);
  if (dif !== 0n) {
    let mayor = 0;
    p8.forEach((p, i) => { if (p > p8[mayor]) mayor = i; });
    partes[mayor] += dif;
  }
  return partes.map((x) => Number(x) / 10_000);
}

/** Loop 18: pieza medida en centímetros (hasta 2 decimales). */
export type PiezaCm = { anchoCm: Decimal; altoCm: Decimal; cantidad: number };
/** `deDesperdicioDe`: índice del trabajo de este corte en cuyo desperdicio se imprimió (L18.E2, ej. pl mogul en bob). */
export type TrabajoCorte = { piezas: readonly PiezaCm[]; deDesperdicioDe?: number };
export type ResultadoCorte = ResultadoMerma & { porTrabajo: { m2Piezas: number; m2Desperdicio: number; aprovechado: boolean }[] };

/** m² con coma decimal y sin ceros de más, para los mensajes ("0,25", "9,4667"). */
const m2Texto = (v8: bigint) => String(a4(v8)).replace('.', ',');

function areaPiezas8(piezas: readonly PiezaCm[]) {
  if (piezas.length < 1) throw new Error('Cada trabajo necesita al menos una pieza');
  let s = 0n;
  for (const p of piezas) {
    if (!Number.isInteger(p.cantidad) || p.cantidad < 1) throw new Error('La cantidad de piezas tiene que ser un entero ≥ 1');
    const a = aEscalado(p.anchoCm, 2) * aEscalado(p.altoCm, 2);
    if (a <= 0n) throw new Error('Las medidas de las piezas tienen que ser mayores a 0');
    s += a * BigInt(p.cantidad);
  }
  return s;
}

/**
 * Corte de Edu en centímetros (Loop 18): la medida total del material que salió de la máquina (ancho × largo)
 * y las piezas de cada trabajo. El desperdicio total se reparte entre los trabajos en proporción a sus m² de piezas.
 * cm × 100 (escala 2) por cm × 100 = m² en escala 8. Σ de piezas + desperdicio de todos los trabajos = m² usados (escala 4).
 * L18.E2: un trabajo impreso en el desperdicio de otro no suma m² ni paga desperdicio (su material ya está en el otro).
 */
export function calcularCorte(anchoCm: Decimal, largoCm: Decimal, trabajos: readonly TrabajoCorte[]): ResultadoCorte {
  const usados8 = aEscalado(anchoCm, 2) * aEscalado(largoCm, 2);
  if (usados8 <= 0n) throw new Error('El material usado tiene que ser mayor a 0');
  if (trabajos.length < 1) throw new Error('Falta al menos un trabajo con sus piezas');
  const piezas8 = trabajos.map((t) => areaPiezas8(t.piezas));
  trabajos.forEach((t, i) => {
    const o = t.deDesperdicioDe;
    if (o === undefined) return;
    if (!Number.isInteger(o) || o < 0 || o >= trabajos.length || o === i) throw new Error('El trabajo del que sale no está en este corte');
    if (trabajos[o].deDesperdicioDe !== undefined) throw new Error('Ese trabajo sale de otro trabajo que también sale de un desperdicio: elegí el trabajo que usa el material');
    if (piezas8[i] > piezas8[o]) throw new Error('Lo que sale del desperdicio es más grande que el trabajo del que sale: revisá las medidas');
  });
  const pagan = trabajos.map((t) => t.deDesperdicioDe === undefined);
  if (!pagan.some(Boolean)) throw new Error('Al menos un trabajo tiene que usar el material');
  const total8 = piezas8.reduce((a, b, i) => (pagan[i] ? a + b : a), 0n);
  if (total8 > usados8) throw new Error(`Las piezas suman ${m2Texto(total8)} m² y el material ${m2Texto(usados8)} m²: revisá las medidas`);
  const piezas4 = piezas8.map(a4);
  const usados4 = a4(usados8);
  // El desperdicio sale de lo ya redondeado: así piezas + desperdicio de los que pagan cierra exacto con lo usado.
  const desp4 = Math.max(0, Math.round(usados4 * 1e4) - piezas4.reduce((a, b, i) => (pagan[i] ? a + Math.round(b * 1e4) : a), 0));
  const idx = pagan.flatMap((p, i) => (p ? [i] : []));
  const partes = desp4 > 0 ? repartirCantidad((desp4 / 1e4).toFixed(4), idx.map((i) => piezas4[i].toFixed(4))) : idx.map(() => 0);
  const pct10 = (total8 * 1000n * 2n + usados8) / (usados8 * 2n);
  return {
    m2Usados: usados4,
    m2Piezas: a4(total8),
    m2Desperdicio: desp4 / 1e4,
    aprovechamientoPct: Number(pct10) / 10,
    porTrabajo: piezas4.map((m2Piezas, i) => ({ m2Piezas, m2Desperdicio: pagan[i] ? partes[idx.indexOf(i)] : 0, aprovechado: !pagan[i] })),
  };
}

export const UNIDADES_INSUMO = ['UNIDAD', 'METRO', 'M2', 'PLANCHA', 'LITRO', 'KG', 'ROLLO', 'LATA', 'BOLSA', 'PAR', 'TIRA', 'MINUTO', 'KM'] as const;
export type UnidadInsumo = (typeof UNIDADES_INSUMO)[number];

/** Normaliza las unidades escritas a mano en la planilla ("el m2", "M2", "rollo 25 m", "Min"…). */
export function normalizarUnidad(texto: string | null | undefined): UnidadInsumo | null {
  const t = (texto ?? '').toString().trim().toLowerCase().replace(/^el\s+/, '');
  if (!t || t === 'none') return null;
  if (/^m2$|^m²$/.test(t)) return 'M2';
  if (/^(m|metro|metros)$/.test(t)) return 'METRO';
  if (/^plancha/.test(t)) return 'PLANCHA';
  if (/^litro/.test(t)) return 'LITRO';
  if (/^(kg|kilo)/.test(t)) return 'KG';
  if (/^rollo/.test(t)) return 'ROLLO';
  if (/^lata/.test(t)) return 'LATA';
  if (/^bolsa/.test(t)) return 'BOLSA';
  if (/^par$/.test(t)) return 'PAR';
  if (/^tira/.test(t)) return 'TIRA';
  if (/^(min|minuto)/.test(t)) return 'MINUTO';
  if (/^km$/.test(t)) return 'KM';
  if (/^unidad/.test(t)) return 'UNIDAD';
  return null;
}
