import {
  ConflictError,
  PeriodRanking,
  type Actor,
  type FundingPeriod,
  type FundingPeriodRepository,
  type KioskDeviceRepository,
  type MovementRepository,
  type PeriodRankingRepository,
  type RankingAuthor,
  type UserRepository,
} from '../../domain';
import {
  toPeriodRankingDto,
  type PeriodRankingDto,
  type PeriodRankingStatusDto,
  type RankingPeriodOptionDto,
} from '../dto';
import type { Clock } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { periodRange, toDateOnly } from '../shared/dates';
import { getPeriodOrFail } from '../shared/loaders';

/** Cuántos puestos se guardan: todos los que retiraron algo, hasta este tope. */
const MAX_ENTRIES = 50;

/** Quién pide calcular: un usuario (debe ser admin) o una tablet autorizada. */
export type RankingCaller = { actor: Actor } | { kioskDeviceId: string };

/** Se puede calcular cuando la quincena ya terminó (pasó su último día) o el admin la cerró. */
function finishedAt(period: FundingPeriod, timeZone: string): Date {
  return periodRange(period, timeZone).endsAt;
}
function isFinished(period: FundingPeriod, now: Date, timeZone: string): boolean {
  return !period.isOpen() || now.getTime() >= finishedAt(period, timeZone).getTime();
}

/** Nombre de quien lo calculó, para mostrarlo ("Admin FridgeYA" o la tablet "Tablet cocina"). */
class RankingAuthorNames {
  constructor(
    private readonly users: UserRepository,
    private readonly devices: KioskDeviceRepository,
  ) {}

  async nameOf(author: RankingAuthor): Promise<string> {
    if (author.kind === 'user') {
      const user = await this.users.findById(author.id);
      return user ? `${user.name} ${user.lastname}` : 'Administrador';
    }
    return (await this.devices.findById(author.id))?.name ?? 'Tablet';
  }

  async toDto(ranking: PeriodRanking, period: FundingPeriod): Promise<PeriodRankingDto> {
    return toPeriodRankingDto(ranking, period, await this.nameOf(ranking.computedBy));
  }
}

/**
 * "Calcular el más hambriento": al terminar la quincena se guardan su podio y quién sacó más.
 * - Desde la tablet: solo la primera vez (un resultado guardado no se cambia desde la tablet).
 * - Un admin además puede volver a calcularlo (p. ej. si se registró tarde un retiro): reemplaza el resultado.
 */
export class ComputePeriodRankingUseCase {
  private readonly names: RankingAuthorNames;

  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly movements: MovementRepository,
    private readonly rankings: PeriodRankingRepository,
    users: UserRepository,
    devices: KioskDeviceRepository,
    private readonly clock: Clock,
    private readonly timeZone: string,
  ) {
    this.names = new RankingAuthorNames(users, devices);
  }

  async execute(periodId: string, caller: RankingCaller): Promise<PeriodRankingDto> {
    if ('actor' in caller) requireAdmin(caller.actor);
    const author: RankingAuthor =
      'actor' in caller ? { kind: 'user', id: caller.actor.id } : { kind: 'kiosk', id: caller.kioskDeviceId };

    const period = await getPeriodOrFail(this.periods, periodId);
    const now = this.clock.now();
    if (!isFinished(period, now, this.timeZone)) {
      throw new ConflictError(
        'La quincena todavía no ha terminado: el más hambriento se calcula cuando termine o al cerrarla',
        'PERIOD_NOT_FINISHED',
        { periodId, availableFrom: finishedAt(period, this.timeZone).toISOString() },
      );
    }
    if (author.kind === 'kiosk' && (await this.rankings.findByPeriod(periodId))) {
      throw new ConflictError(
        'El más hambriento de esta quincena ya se calculó; solo un administrador puede recalcularlo',
        'RANKING_ALREADY_COMPUTED',
        { periodId },
      );
    }

    const rows = await this.movements.findTopWithdrawers(periodRange(period, this.timeZone), MAX_ENTRIES);
    const ranking = PeriodRanking.compute({ periodId, rows, computedBy: author, now });
    await this.rankings.save(ranking);
    return this.names.toDto(ranking, period);
  }
}

/** Estado del ranking de una quincena: si ya se calculó (y su resultado) o desde cuándo se puede calcular. */
export class GetPeriodRankingUseCase {
  private readonly names: RankingAuthorNames;

  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly rankings: PeriodRankingRepository,
    users: UserRepository,
    devices: KioskDeviceRepository,
    private readonly clock: Clock,
    private readonly timeZone: string,
  ) {
    this.names = new RankingAuthorNames(users, devices);
  }

  async execute(periodId: string): Promise<PeriodRankingStatusDto> {
    const period = await getPeriodOrFail(this.periods, periodId);
    const ranking = await this.rankings.findByPeriod(periodId);
    return {
      periodId,
      canCompute: isFinished(period, this.clock.now(), this.timeZone),
      availableFrom: finishedAt(period, this.timeZone).toISOString(),
      ranking: ranking ? await this.names.toDto(ranking, period) : null,
    };
  }
}

/** El último "más hambriento" calculado. null si nunca se ha calculado. */
export class GetLatestPeriodRankingUseCase {
  private readonly names: RankingAuthorNames;

  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly rankings: PeriodRankingRepository,
    users: UserRepository,
    devices: KioskDeviceRepository,
  ) {
    this.names = new RankingAuthorNames(users, devices);
  }

  async execute(): Promise<PeriodRankingDto | null> {
    const ranking = await this.rankings.findLatest();
    if (!ranking) return null;
    return this.names.toDto(ranking, await getPeriodOrFail(this.periods, ranking.periodId));
  }
}

/**
 * Quincenas para el selector del ranking (también en la tablet, sin los montos del fondo):
 * la más reciente primero, con si ya terminó y si ya tiene su más hambriento calculado.
 */
export class ListRankingPeriodsUseCase {
  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly rankings: PeriodRankingRepository,
    private readonly clock: Clock,
    private readonly timeZone: string,
  ) {}

  async execute(): Promise<RankingPeriodOptionDto[]> {
    const [summaries, computed] = await Promise.all([
      this.periods.findAllSummaries(),
      this.rankings.findComputedPeriodIds(),
    ]);
    const computedIds = new Set(computed);
    const now = this.clock.now().getTime();
    return summaries.map((s) => ({
      id: s.periodId,
      name: s.name,
      startDate: toDateOnly(s.startDate),
      endDate: toDateOnly(s.endDate),
      status: s.status,
      finished: s.status !== 'OPEN' || now >= periodRange(s, this.timeZone).endsAt.getTime(),
      computed: computedIds.has(s.periodId),
    }));
  }
}
