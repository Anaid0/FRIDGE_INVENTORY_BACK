import type { DateRange } from '../../domain';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' de una fecha sin hora (las fechas de quincena se guardan a medianoche UTC). */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 'period' = la quincena abierta (sin quincena abierta, el ranking queda vacío). */
export type RankingWindow = 'all' | 'month' | 'week' | 'period';

/** Ventanas móviles: últimos 30 días ('month') o últimos 7 días ('week'). */
export function rankingRange(window: Exclude<RankingWindow, 'period'>, now: Date): DateRange {
  if (window === 'week') return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
  if (window === 'month') return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
  return {};
}

/** Cuánto le suma la zona horaria a la hora UTC en ese instante (Bogotá: −5 h). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instante en que empieza el día (00:00) de una fecha sin hora, en la zona horaria de la oficina. */
export function startOfDayInZone(day: Date, timeZone: string): Date {
  const midnightUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  let instant = midnightUtc - zoneOffsetMs(new Date(midnightUtc), timeZone);
  // Si entre medio cambió el horario de verano, el segundo cálculo corrige la diferencia.
  instant = midnightUtc - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/**
 * Rango de movimientos de una quincena: desde las 00:00 de su primer día hasta el último milisegundo de
 * su último día, en la hora de la oficina (las fechas de quincena se guardan sin hora).
 */
export function periodRange(period: { startDate: Date; endDate: Date }, timeZone: string) {
  const nextDay = new Date(period.endDate.getTime() + DAY_MS);
  const endExclusive = startOfDayInZone(nextDay, timeZone);
  return {
    from: startOfDayInZone(period.startDate, timeZone),
    to: new Date(endExclusive.getTime() - 1),
    /** Primer instante después de la quincena (cuando "llega" su fin). */
    endsAt: endExclusive,
  };
}
