import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Los archivos corren en serie porque comparten secuencias globales en dev (ej. OT-2026 en CA-1.5)
    // y el límite de conexiones simultáneas del pooler de Supabase Free Tier.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
