import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL no configurada.');
}

// Pooler de transacciones (puerto 6543) exige prepare: false
export const sql = postgres(url, {
  prepare: false,
  max: 15,
  idle_timeout: 20,
  connect_timeout: 10,
});
