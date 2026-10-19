import 'dotenv/config';
import { execFileSync } from 'node:child_process';

/** Aplica las migraciones a la base de tests e2e (DATABASE_URL_TEST). */
const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error('✖ Falta DATABASE_URL_TEST en el .env');
  process.exit(1);
}

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});
