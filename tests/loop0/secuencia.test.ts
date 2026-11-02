import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import { api, cerrarConexiones } from './helpers.js';
import { sql } from '../../apps/api/src/db/client.js';

afterAll(cerrarConexiones);

function listarArchivosTs(dir: string): string[] {
  const entradas = fs.readdirSync(dir, { withFileTypes: true });
  return entradas.flatMap((e) => {
    const ruta = path.join(dir, e.name);
    return e.isDirectory() ? listarArchivosTs(ruta) : e.name.endsWith('.ts') ? [ruta] : [];
  });
}

describe('Contador atómico concurrente y disciplina del pooler 6543', () => {
  it('50 llamadas simultáneas generan números exactamente correlativos', async () => {
    const tag = 'TEST-' + Date.now();
    const resultados = await Promise.all(
      Array.from({ length: 50 }, () => api`SELECT siguiente_valor(${tag}) AS v`),
    );
    const valores = resultados.map((r) => Number(r[0].v)).sort((a, b) => a - b);
    expect(new Set(valores).size).toBe(50);
    expect(valores[0]).toBe(1);
    expect(valores[49]).toBe(50);
  });

  it('sinPipelining en client.ts permite mezclar 20 consultas sin parámetros y 20 con parámetros en paralelo sin colgarse', async () => {
    const promesas = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? sql`SELECT 1::int AS ok` : sql`SELECT ${i}::int AS ok`,
    );
    const res = await Promise.all(promesas);
    expect(res).toHaveLength(40);
    expect(res[0][0].ok).toBe(1);
    expect(res[1][0].ok).toBe(1);
  });

  it('auditoría estática: toda consulta ejecutada con await sql/tx/runner/adminSql en apps/api/src incluye al menos un parámetro', () => {
    const archivos = listarArchivosTs(path.resolve('apps/api/src'));
    const patronAwaitSql = /await\s+(?:sql|tx|runner|adminSql)\s*`([^`]*)`/g;
    const sinParametros: string[] = [];

    for (const archivo of archivos) {
      const contenido = fs.readFileSync(archivo, 'utf8');
      for (const match of contenido.matchAll(patronAwaitSql)) {
        const cuerpo = match[1];
        if (!cuerpo.includes('${')) {
          sinParametros.push(`${path.relative(process.cwd(), archivo)}: ${cuerpo.trim()}`);
        }
      }
    }

    expect(sinParametros, 'Consultas sin parámetros detectadas en apps/api/src').toEqual([]);
  });
});
