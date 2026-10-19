import 'dotenv/config';

/** Puerto de la API durante los e2e del navegador (el front de pruebas apunta aquí). */
export const E2E_API_PORT = '3100';

/**
 * Variables de entorno para los e2e: misma configuración del .env pero contra DATABASE_URL_TEST.
 * Se niega a continuar si esa base no termina en "_test" (para no borrar la de desarrollo).
 */
export function e2eEnv(): NodeJS.ProcessEnv {
  const testUrl = process.env.DATABASE_URL_TEST ?? '';
  let database = '';
  try {
    database = new URL(testUrl).pathname.replace(/^\//, '');
  } catch {
    /* URL inválida */
  }
  if (!database.endsWith('_test')) {
    throw new Error(`DATABASE_URL_TEST debe apuntar a una base *_test (actual: "${testUrl}")`);
  }
  return {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testUrl,
    PORT: E2E_API_PORT,
    BCRYPT_ROUNDS: '4',
    UPLOADS_DIR: './uploads-e2e',
  };
}
