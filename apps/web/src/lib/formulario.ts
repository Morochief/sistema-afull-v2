import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodTypeAny } from 'zod';

/**
 * Un <input> vacío entrega '' y los esquemas de @afull/shared usan `.optional()`, que acepta
 * `undefined` pero NO ''. Sin esto, dejar vacío un campo opcional con formato (email, uuid,
 * fecha) bloqueaba el formulario con "Invalid email" aunque el campo no sea obligatorio.
 */
export function vaciosAUndefined<T>(valores: T): T {
  if (!valores || typeof valores !== 'object') return valores;
  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(valores as Record<string, unknown>)) {
    limpio[clave] = typeof valor === 'string' && valor.trim() === '' ? undefined : valor;
  }
  return limpio as T;
}

/** zodResolver que primero convierte los textos vacíos en `undefined`. */
export function resolverSinVacios<T extends FieldValues>(esquema: ZodTypeAny): Resolver<T> {
  const base = zodResolver(esquema) as unknown as Resolver<T>;
  return (valores, contexto, opciones) => base(vaciosAUndefined(valores), contexto, opciones);
}
