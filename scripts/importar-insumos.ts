/**
 * Importa el catálogo de insumos desde la planilla de la empresa (Loop 5).
 *
 * Uso:
 *   1. En Excel: Archivo → Guardar como → "CSV (delimitado por punto y coma)" (columnas: Insumo, Costo, Unidad Medida, Unidad).
 *   2. Prueba sin escribir nada:   pnpm tsx scripts/importar-insumos.ts ruta/insumos.csv
 *   3. Cargar de verdad:           pnpm tsx scripts/importar-insumos.ts ruta/insumos.csv --aplicar
 *
 * Normaliza las unidades ("el m2", "M2", "rollo 25 m", "Min"…). Descarta y lista las filas sin unidad reconocible
 * y las repetidas con otro costo; ignora las repetidas idénticas; importa sin precio las que no tienen costo.
 * No duplica: si ya existe un insumo con el mismo nombre y unidad, lo saltea (se puede correr dos veces).
 * ⚠️ El archivo de la empresa NO va al repo. Con datos reales, respetar el bloqueo de TRASPASO §12 (CA-0.9).
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { config } from 'dotenv';
import { normalizarUnidad } from '../packages/shared/src/formulas/material.js';

config({ path: ['.env', '.env.test'] });

/** CSV mínimo: separador ; o , y comillas dobles. */
function parsearCsv(texto: string): string[][] {
  const sep = (texto.split('\n')[0].match(/;/g)?.length ?? 0) > 0 ? ';' : ',';
  const filas: string[][] = [];
  for (const linea of texto.replace(/\r/g, '').split('\n')) {
    if (!linea.trim()) continue;
    const campos: string[] = [];
    let actual = '';
    let comillas = false;
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i];
      if (ch === '"') {
        if (comillas && linea[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas;
      } else if (ch === sep && !comillas) { campos.push(actual); actual = ''; } else actual += ch;
    }
    campos.push(actual);
    filas.push(campos.map((c) => c.trim()));
  }
  return filas;
}

/** "202.250" / "202250" / "1.234,56" → número; vacío o texto → null. */
function costo(texto: string): number | null {
  const t = texto.replace(/[^\d,.-]/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10_000) / 10_000 : null;
}

const SECTORES: Record<string, string> = {
  carpinteria: 'Carpintería', herreria: 'Herrería', impresiones: 'Impresiones', impresion: 'Impresiones', laser: 'Láser',
  pintureria: 'Pinturería', electricidad: 'Electricidad', ploteo: 'Ploteo', varios: 'Varios', produccion: 'Producción',
  carteleria: 'Cartelería', logistica: 'Logística',
};
const sector = (t: string) => SECTORES[t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()] ?? null;

const [, , ruta, bandera] = process.argv;
if (!ruta) {
  console.error('Uso: pnpm tsx scripts/importar-insumos.ts archivo.csv [--aplicar]');
  process.exit(1);
}
const filas = parsearCsv(readFileSync(ruta, 'utf8')).slice(1);
const vistos = new Set<string>();
const ok: { nombre: string; unidad: string; sector: string | null; costo: number | null }[] = [];
const descartes: string[] = [];
const sinPrecio: string[] = [];
let identicos = 0;
for (const f of filas) {
  const [nombre = '', c = '', um = '', sec = ''] = f;
  if (!nombre) continue;
  const unidad = normalizarUnidad(um);
  const precio = costo(c);
  if (!unidad) { descartes.push(`sin unidad reconocible ("${um}"): ${nombre}`); continue; }
  const k = `${nombre.toLowerCase()}|${unidad}`;
  if (vistos.has(k)) {
    // Fila repetida idéntica (mismo nombre, unidad y costo): se ignora sin avisar. Con otro costo: a revisar.
    if (ok.find((x) => `${x.nombre.toLowerCase()}|${x.unidad}` === k)?.costo === precio) identicos++;
    else descartes.push(`repetido con otro costo (se usa el primero): ${nombre} [${unidad}]`);
    continue;
  }
  vistos.add(k);
  // Sin costo: se importa igual, sin precio; el admin lo carga en "Insumos" (hasta entonces no se puede usar).
  if (precio === null) sinPrecio.push(nombre);
  ok.push({ nombre: nombre.slice(0, 150), unidad, sector: sector(sec), costo: precio });
}

const porUnidad = ok.reduce<Record<string, number>>((a, x) => ({ ...a, [x.unidad]: (a[x.unidad] ?? 0) + 1 }), {});
console.log(`Filas leídas: ${filas.length} · para importar: ${ok.length} (sin precio: ${sinPrecio.length}) · repetidas idénticas: ${identicos} · a revisar: ${descartes.length}`);
console.log('Por unidad:', porUnidad);
for (const d of descartes) console.log('  - ' + d);
for (const n of sinPrecio) console.log('  · sin precio (cargarlo en Insumos): ' + n);

if (bandera !== '--aplicar') {
  console.log('\nPrueba sin escribir (agregá --aplicar para cargar).');
  process.exit(0);
}
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1, prepare: false });
let nuevos = 0;
await sql.begin(async (tx) => {
  for (const x of ok) {
    const [i] = await tx`
      INSERT INTO insumo (nombre, unidad, sector) VALUES (${x.nombre}, ${x.unidad}, ${x.sector})
      ON CONFLICT (lower(nombre), unidad) DO NOTHING RETURNING id
    `;
    if (!i) continue;
    if (x.costo !== null) await tx`INSERT INTO insumo_precio (insumo_id, costo_unitario_gs) VALUES (${i.id}, ${x.costo})`;
    nuevos++;
  }
});
await sql.end();
console.log(`\nImportados: ${nuevos} (los que ya existían se saltearon).`);
