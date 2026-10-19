import type { Money } from '../shared/Money';
import type { PeriodStatus } from './PeriodStatus';

/** Resumen de dinero de una quincena: recaudado, gastado y saldo. */
export interface PeriodSummary {
  periodId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  collected: Money;
  spent: Money;
  balance: Money;
  /** Se gastó más de lo recaudado (saldo negativo). */
  isOverspent: boolean;
}

export interface PeriodInfo {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
}

export function buildPeriodSummary(period: PeriodInfo, collected: Money, spent: Money): PeriodSummary {
  const balance = collected.subtract(spent);
  return {
    periodId: period.id,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    collected,
    spent,
    balance,
    isOverspent: balance.isNegative(),
  };
}
