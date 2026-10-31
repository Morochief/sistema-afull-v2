import { config } from 'dotenv';

// No pisa variables ya definidas (CI). Local: .env.test (en .gitignore).
config({ path: '.env.test' });
process.env.DATABASE_URL ??= process.env.DATABASE_URL_API;
process.env.APP_ORIGIN ??= 'http://localhost:3000';
