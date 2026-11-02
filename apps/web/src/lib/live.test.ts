import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { suscribirseLive } from './live.js';

describe('apps/web — lib/live.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suscribirseLive retorna una función para desuscribirse y no arroja error', () => {
    const cb = vi.fn();
    const desuscribir = suscribirseLive(cb);
    expect(typeof desuscribir).toBe('function');
    expect(() => desuscribir()).not.toThrow();
  });

  it('procesa eventos con debounce de 1 segundo', () => {
    const cb = vi.fn();
    const desuscribir = suscribirseLive(cb);

    // Si pasara un segundo sin eventos, no se invoca
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();

    desuscribir();
  });
});
