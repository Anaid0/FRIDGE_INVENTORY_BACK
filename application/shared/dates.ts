import type { DateRange } from '../../domain';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' de una fecha sin hora (las fechas de quincena se guardan a medianoche UTC). */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type RankingWindow = 'all' | 'month' | 'week';

/** Ventanas móviles: últimos 30 días ('month') o últimos 7 días ('week'). */
export function rankingRange(window: RankingWindow, now: Date): DateRange {
  if (window === 'week') return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
  if (window === 'month') return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
  return {};
}
