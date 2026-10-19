import type { Prisma, PrismaClient } from './generated/client';

/** Cliente raíz o cliente de una transacción: los repositorios funcionan con cualquiera de los dos. */
export type DbClient = PrismaClient | Prisma.TransactionClient;
