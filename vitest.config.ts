import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Los archivos corren en serie porque comparten secuencias globales en dev (ej. OT-2026 en CA-1.5)
    // y el límite de conexiones simultáneas del pooler de Supabase Free Tier.
    fileParallelism: false,
    // Contra Supabase dev desde GitHub Actions (EE. UU. → São Paulo) cada consulta tarda ~10 veces más:
    // tests-dev.yml sube el tope con TEST_TIMEOUT_MS. Local y CI (base en el mismo runner) siguen en 30 s.
    testTimeout: Number(process.env.TEST_TIMEOUT_MS) || 30_000,
    hookTimeout: Number(process.env.TEST_TIMEOUT_MS) || 30_000,
  },
});
