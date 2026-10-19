import type { PeriodRanking } from './PeriodRanking';

export interface PeriodRankingRepository {
  findByPeriod(periodId: string): Promise<PeriodRanking | null>;
  /** El ranking calculado de la quincena más reciente (por fecha de fin) que ya tenga uno. */
  findLatest(): Promise<PeriodRanking | null>;
  /** Ids de las quincenas que ya tienen su ranking calculado. */
  findComputedPeriodIds(): Promise<string[]>;
  /** Guarda el ranking de la quincena, reemplazando el anterior si ya existía. */
  save(ranking: PeriodRanking): Promise<void>;
}
