import { readFileSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/client';

export type { PrismaClient };

/**
 * Mismo sql_mode que el MySQL local (docker): algunos MySQL administrados (p. ej. Aiven) traen
 * modo ANSI, donde las comillas dobles son identificadores y `||` concatena.
 */
const SQL_MODE =
  'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

/**
 * TLS con los mismos parámetros de URL que entiende Prisma (también los usa `prisma migrate`):
 * - `sslaccept=strict` verifica el certificado; con `sslcert=<ruta del CA>` lo verifica contra ese CA.
 * - `sslaccept=accept_invalid_certs` cifra sin verificar el certificado.
 * Sin ninguno de los dos, conexión sin TLS (MySQL local en docker).
 */
function sslOptions(url: URL) {
  const accept = url.searchParams.get('sslaccept');
  const caPath = url.searchParams.get('sslcert');
  if (!accept && !caPath) return undefined;
  if (accept === 'accept_invalid_certs') return { rejectUnauthorized: false };
  return caPath ? { ca: readFileSync(caPath, 'utf8') } : { rejectUnauthorized: true };
}

/**
 * Crea el cliente de Prisma usando el driver adapter de MariaDB (compatible con MySQL 8).
 * La URL se desarma en opciones del pool para poder fijar las que MySQL 8 necesita.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: Number(url.searchParams.get('connection_limit') ?? 10),
    // El default (1 s) no alcanza para el saludo TLS con una base en la nube.
    connectTimeout: Number(url.searchParams.get('connect_timeout') ?? 10) * 1000,
    // MySQL 8 usa caching_sha2_password; sin TLS el driver necesita pedir la llave pública.
    allowPublicKeyRetrieval: true,
    ssl: sslOptions(url),
    initSql: `SET SESSION sql_mode = '${SQL_MODE}'`,
  });
  return new PrismaClient({ adapter });
}
