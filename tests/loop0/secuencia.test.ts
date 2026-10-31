import { describe, it, expect, afterAll } from 'vitest';
import { api, cerrarConexiones } from './helpers.js';

afterAll(cerrarConexiones);

describe('Contador atómico concurrente', () => {
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
});
