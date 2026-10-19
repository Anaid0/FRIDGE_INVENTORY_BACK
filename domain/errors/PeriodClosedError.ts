import { ConflictError } from '../shared/DomainError';

export class PeriodClosedError extends ConflictError {
  constructor(periodId: string) {
    super('La quincena está cerrada y ya no acepta aportes ni compras', 'PERIOD_CLOSED', { periodId });
  }
}
