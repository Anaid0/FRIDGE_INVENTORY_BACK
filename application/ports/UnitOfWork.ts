import type {
  ContributionRepository,
  FundingPeriodRepository,
  MovementRepository,
  ProductRepository,
  PurchaseRepository,
  UserRepository,
} from '../../domain';

/** Repositorios ligados a una misma transacción. */
export interface TransactionalRepositories {
  users: UserRepository;
  products: ProductRepository;
  movements: MovementRepository;
  periods: FundingPeriodRepository;
  contributions: ContributionRepository;
  purchases: PurchaseRepository;
}

/**
 * Ejecuta `work` dentro de una transacción: si lanza un error no queda nada guardado.
 */
export interface UnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
