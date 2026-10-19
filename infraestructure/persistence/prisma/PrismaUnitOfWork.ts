import type { TransactionalRepositories, UnitOfWork } from '../../../application';
import { Prisma, type PrismaClient } from './generated/client';
import { PrismaConsumptionChargeRepository } from './repositories/PrismaConsumptionChargeRepository';
import { PrismaContributionRepository } from './repositories/PrismaContributionRepository';
import { PrismaFundingPeriodRepository } from './repositories/PrismaFundingPeriodRepository';
import { PrismaMovementRepository } from './repositories/PrismaMovementRepository';
import { PrismaProductRepository } from './repositories/PrismaProductRepository';
import { PrismaPurchaseRepository } from './repositories/PrismaPurchaseRepository';
import { PrismaUserRepository } from './repositories/PrismaUserRepository';

/**
 * Transacción interactiva de Prisma: todos los repositorios comparten el mismo `tx`.
 *
 * Se usa READ COMMITTED: con REPEATABLE READ (el default de MySQL) la primera lectura fija una
 * "foto" de los datos, y la lectura del producto después de esperar el `SELECT ... FOR UPDATE`
 * vería un stock viejo (actualizaciones perdidas). Con READ COMMITTED cada lectura ve lo último
 * confirmado, y el bloqueo de la fila serializa los cambios de stock.
 */
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(repositoriesFor(tx)), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: this.options.timeoutMs ?? 10_000,
      maxWait: 5_000,
    });
  }
}

export function repositoriesFor(db: PrismaClient | Prisma.TransactionClient): TransactionalRepositories {
  return {
    users: new PrismaUserRepository(db),
    products: new PrismaProductRepository(db),
    movements: new PrismaMovementRepository(db),
    periods: new PrismaFundingPeriodRepository(db),
    contributions: new PrismaContributionRepository(db),
    purchases: new PrismaPurchaseRepository(db),
    charges: new PrismaConsumptionChargeRepository(db),
  };
}
