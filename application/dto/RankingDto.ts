import type { FundingPeriod, PeriodRanking, PeriodRankingEntry, PeriodStatus } from '../../domain';
import { toDateOnly } from '../shared/dates';

export interface PeriodRankingDto {
  period: { id: string; name: string; startDate: string; endDate: string };
  computedAt: Date;
  /** Quién lo calculó: un administrador (su nombre) o una tablet (el nombre de la tablet). */
  computedBy: { kind: 'user' | 'kiosk'; name: string };
  /** Todos los puestos, de mayor a menor (con empates, `position` se repite). */
  entries: PeriodRankingEntry[];
  /** Primer puesto (más de una persona si empatan). Vacío si nadie sacó nada en la quincena. */
  hungriest: PeriodRankingEntry[];
  podium: PeriodRankingEntry[];
}

export interface PeriodRankingStatusDto {
  periodId: string;
  /** true cuando la quincena ya terminó o está cerrada. */
  canCompute: boolean;
  /** Desde cuándo se puede calcular (el día después del fin de la quincena, a las 00:00). */
  availableFrom: string;
  ranking: PeriodRankingDto | null;
}

/** Una quincena en el selector del ranking (sin montos: también la ve la tablet). */
export interface RankingPeriodOptionDto {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  /** Ya pasó su último día o está cerrada: se puede calcular el más hambriento. */
  finished: boolean;
  /** Ya tiene su más hambriento calculado. */
  computed: boolean;
}

export function toPeriodRankingDto(
  ranking: PeriodRanking,
  period: FundingPeriod,
  computedByName: string,
): PeriodRankingDto {
  return {
    period: {
      id: period.id,
      name: period.name,
      startDate: toDateOnly(period.startDate),
      endDate: toDateOnly(period.endDate),
    },
    computedAt: ranking.computedAt,
    computedBy: { kind: ranking.computedBy.kind, name: computedByName },
    entries: [...ranking.entries],
    hungriest: ranking.hungriest,
    podium: ranking.podium,
  };
}
