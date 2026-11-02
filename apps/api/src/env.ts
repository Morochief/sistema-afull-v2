import path from 'node:path';
import dotenv from 'dotenv';

const rootDir = path.resolve(import.meta.dirname, '../../..');
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '.env.test') });
