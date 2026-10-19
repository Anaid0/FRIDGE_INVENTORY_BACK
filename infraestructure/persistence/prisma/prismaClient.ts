import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/client';

export type { PrismaClient };

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
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: Number(url.searchParams.get('connection_limit') ?? 10),
    // MySQL 8 usa caching_sha2_password; sin TLS el driver necesita pedir la llave pública.
    allowPublicKeyRetrieval: true,
  });
  return new PrismaClient({ adapter });
}
