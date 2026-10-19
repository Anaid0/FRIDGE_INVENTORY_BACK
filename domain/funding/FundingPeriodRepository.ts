import type { FundingPeriod } from './FundingPeriod';
import type { PeriodSummary } from './PeriodSummary';

export interface FundingPeriodRepository {
  findById(id: string): Promise<FundingPeriod | null>;
  /** La quincena abierta actual, si existe (solo puede haber una abierta). */
  findOpen(): Promise<FundingPeriod | null>;
  /** true si alguna quincena se cruza con el rango [startDate, endDate]. */
  existsOverlapping(startDate: Date, endDate: Date, excludeId?: string): Promise<boolean>;
  /** Resúmenes de todas las quincenas, la más reciente primero. Excluye compras anuladas. */
  findAllSummaries(): Promise<PeriodSummary[]>;
  findSummary(periodId: string): Promise<PeriodSummary | null>;
  save(period: FundingPeriod): Promise<void>;
}
