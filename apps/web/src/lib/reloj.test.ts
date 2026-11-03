import { describe, it, expect } from 'vitest';
import { crearSincronizadorReloj, formatearTiempoTranscurrido } from './reloj.js';

describe('CA-2.7 — Reloj: sincronización y compensación de desfase horario', () => {
  const T_INICIO_SERVIDOR = '2026-11-02T15:00:00.000Z'; // Intervalo inició a las 15:00:00
  const T_SERVIDOR_RESPUESTA = '2026-11-02T15:05:00.000Z'; // Servidor responde 5 minutos (300 s) después

  it('calcula segundos transcurridos exactos cuando el reloj del cliente coincide con el servidor', () => {
    const localAlRecibir = new Date(T_SERVIDOR_RESPUESTA).getTime(); // Reloj exacto
    const sinc = crearSincronizadorReloj(T_SERVIDOR_RESPUESTA, localAlRecibir);

    expect(sinc.offsetMs).toBe(0);
    // Al momento de recibir: exactamente 300 segundos
    expect(sinc.segundosTranscurridos(T_INICIO_SERVIDOR, localAlRecibir)).toBe(300);

    // 10 segundos locales después: 310 segundos
    expect(sinc.segundosTranscurridos(T_INICIO_SERVIDOR, localAlRecibir + 10_000)).toBe(310);
  });

  it('compensa correctamente un reloj local adelantado (+15 minutos)', () => {
    const localRealMs = new Date(T_SERVIDOR_RESPUESTA).getTime();
    const localDesfasadoMs = localRealMs + 15 * 60 * 1000; // Reloj local 15 minutos adelante

    const sinc = crearSincronizadorReloj(T_SERVIDOR_RESPUESTA, localDesfasadoMs);
    expect(sinc.offsetMs).toBe(-15 * 60 * 1000);

    // Aunque el reloj local esté en 15:20, el tiempo transcurrido respecto al inicio 15:00 es exactamente 300 s
    expect(sinc.segundosTranscurridos(T_INICIO_SERVIDOR, localDesfasadoMs)).toBe(300);

    // 30 segundos locales después: 330 s
    expect(sinc.segundosTranscurridos(T_INICIO_SERVIDOR, localDesfasadoMs + 30_000)).toBe(330);
  });

  it('compensa correctamente un reloj local atrasado (-2 horas)', () => {
    const localRealMs = new Date(T_SERVIDOR_RESPUESTA).getTime();
    const localDesfasadoMs = localRealMs - 2 * 60 * 60 * 1000; // Reloj local 2 horas atrasado

    const sinc = crearSincronizadorReloj(T_SERVIDOR_RESPUESTA, localDesfasadoMs);
    expect(sinc.offsetMs).toBe(2 * 60 * 60 * 1000);

    // El tiempo transcurrido es exactamente 300 s (5 min)
    expect(sinc.segundosTranscurridos(T_INICIO_SERVIDOR, localDesfasadoMs)).toBe(300);

    // 60 segundos después: 360 s
    expect(sinc.segundosTranscurridos(T_INICIO_SERVIDOR, localDesfasadoMs + 60_000)).toBe(360);
  });

  it('formatea el tiempo en mm:ss o hh:mm:ss adecuadamente', () => {
    expect(formatearTiempoTranscurrido(0)).toBe('00:00');
    expect(formatearTiempoTranscurrido(59)).toBe('00:59');
    expect(formatearTiempoTranscurrido(60)).toBe('01:00');
    expect(formatearTiempoTranscurrido(3599)).toBe('59:59');
    expect(formatearTiempoTranscurrido(3600)).toBe('01:00:00');
    expect(formatearTiempoTranscurrido(3665)).toBe('01:01:05');
  });
});
