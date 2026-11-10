import { describe, it, expect } from 'vitest';
import { resumenPlan, tiempoEstimado, agruparPorOperario, agruparPorDia, hoyAsuncion } from './plan-tarea.js';

const t = (fecha_trabajo: string | null, extra: Record<string, unknown> = {}) => ({ fecha_trabajo, cantidad: null, unidad: null, minutos_estimados: null, persona_asignada_nombre: null, ...extra });

describe('plan de la tarea (Loop 11)', () => {
  it('resume cantidad, día y tiempo estimado', () => {
    expect(resumenPlan(t('2030-03-05', { cantidad: 2.5, unidad: 'm2', minutos_estimados: 90 }))).toBe('2,5 m2 · 05/03 · ~1 h 30 min');
    expect(resumenPlan(t(null, { cantidad: 4 }))).toBe('4 u');
    expect(resumenPlan(t(null))).toBe('');
    expect([tiempoEstimado(45), tiempoEstimado(120)]).toEqual(['45 min', '2 h']);
  });

  it('agrupa por operario en orden alfabético con "Sin asignar" al final', () => {
    const g = agruparPorOperario([t(null, { persona_asignada_nombre: 'Eduardo' }), t(null), t(null, { persona_asignada_nombre: 'Carlos' }), t(null, { persona_asignada_nombre: 'Eduardo' })]);
    expect(g.map((x) => [x.nombre, x.items.length])).toEqual([['Carlos', 1], ['Eduardo', 2], ['Sin asignar', 1]]);
  });

  it('CA-11.6: Mi trabajo agrupa en Atrasadas, Para hoy, Próximas y Sin día (y omite los grupos vacíos)', () => {
    const g = agruparPorDia([t('2030-03-04'), t('2030-03-05'), t(null), t('2030-03-09'), t('2030-03-05')], '2030-03-05');
    expect(g.map((x) => [x.grupo, x.items.length])).toEqual([['Atrasadas', 1], ['Para hoy', 2], ['Próximas', 1], ['Sin día', 1]]);
    expect(agruparPorDia([t(null)], '2030-03-05').map((x) => x.grupo)).toEqual(['Sin día']);
  });

  it('hoy es la fecha de Asunción, no la de UTC', () => {
    expect(hoyAsuncion(new Date('2030-03-06T01:30:00Z'))).toBe('2030-03-05');
  });
});
