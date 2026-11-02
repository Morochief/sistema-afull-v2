import { describe, it, expect } from 'vitest';
import { nuevoClienteSchema, nuevaOTSchema } from '@afull/shared';
import { vaciosAUndefined } from './formulario.js';

describe('vaciosAUndefined: campos opcionales vacíos no bloquean el formulario', () => {
  it('un cliente sin email ni RUC valida contra nuevoClienteSchema', () => {
    const valores = { nombre: 'Acme', razonSocial: '', ruc: '', telefono: '', email: '' };
    expect(nuevoClienteSchema.safeParse(valores).success).toBe(false); // el problema original
    expect(nuevoClienteSchema.safeParse(vaciosAUndefined(valores)).success).toBe(true);
  });

  it('una OT sin sucursal ni fecha valida contra nuevaOTSchema', () => {
    const valores = {
      clienteId: '11111111-1111-4111-8111-111111111111',
      sucursalId: '',
      titulo: 'Cartel',
      descripcion: '',
      fechaPrometida: '',
    };
    expect(nuevaOTSchema.safeParse(vaciosAUndefined(valores)).success).toBe(true);
  });

  it('no toca valores con contenido', () => {
    expect(vaciosAUndefined({ a: ' x ', b: 0, c: false })).toEqual({ a: ' x ', b: 0, c: false });
  });
});
