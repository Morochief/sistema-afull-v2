import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// En CI las variables ya vienen del entorno (dotenv no las pisa).
config({ path: ['.env.test', '.env'] });

if (!process.env.DATABASE_URL_ADMIN) {
  throw new Error('DATABASE_URL_ADMIN es obligatoria para ejecutar migraciones.');
}

export default defineConfig({
  dialect: 'postgresql',
  out: './migrations',
  schema: './apps/api/src/db/schema.ts',
  dbCredentials: { url: process.env.DATABASE_URL_ADMIN },
  verbose: true,
  strict: true,
});
