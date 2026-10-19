import type {
  DateRange,
  FundingPeriodRepository,
  MovementFilter,
  MovementRepository,
  MovementView,
  Page,
  PersonActivity,
  TopWithdrawer,
} from '../../domain';
import type { Clock } from '../ports';
import { periodRange, rankingRange, toDateOnly, type RankingWindow } from '../shared/dates';
import { getPeriodOrFail } from '../shared/loaders';
import { toPageRequest } from '../shared/pagination';

export interface ListMovementsInput extends MovementFilter {
  page?: number;
  pageSize?: number;
}

export class ListMovementsUseCase {
  constructor(private readonly movements: MovementRepository) {}

  async execute(input: ListMovementsInput): Promise<Page<MovementView>> {
    const { page, pageSize, ...filter } = input;
    return this.movements.findPage(filter, toPageRequest(page, pageSize));
  }
}

export interface TopWithdrawersInput {
  window?: RankingWindow;
  /** Una quincena concreta (tiene prioridad sobre `window`). */
  periodId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

export interface PeopleActivityDto {
  /** La quincena consultada (la abierta si no se indicó); null si no hay quincena abierta. */
  period: { id: string; name: string; startDate: string; endDate: string } | null;
  people: PersonActivity[];
}

/** Cuánto sacó y metió cada persona en una quincena (pantalla Personas). */
export class GetPeopleActivityUseCase {
  constructor(
    private readonly movements: MovementRepository,
    private readonly periods: FundingPeriodRepository,
    private readonly timeZone: string,
  ) {}

  async execute(input: { periodId?: string } = {}): Promise<PeopleActivityDto> {
    const period = input.periodId
      ? await getPeriodOrFail(this.periods, input.periodId)
      : await this.periods.findOpen();
    if (!period) return { period: null, people: [] };
    return {
      period: {
        id: period.id,
        name: period.name,
        startDate: toDateOnly(period.startDate),
        endDate: toDateOnly(period.endDate),
      },
      people: await this.movements.findActivityByPerson(periodRange(period, this.timeZone)),
    };
  }
}

/**
 * Ranking de quién más retira productos (solo salidas manuales, por quien las realizó), en vivo:
 * desde siempre, en los últimos 30 o 7 días, o en una quincena (por sus fechas, en la hora de la oficina).
 */
export class GetTopWithdrawersUseCase {
  constructor(
    private readonly movements: MovementRepository,
    private readonly periods: FundingPeriodRepository,
    private readonly clock: Clock,
    private readonly timeZone: string,
  ) {}

  async execute(input: TopWithdrawersInput = {}): Promise<TopWithdrawer[]> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const range = await this.range(input);
    return range ? this.movements.findTopWithdrawers(range, limit) : [];
  }

  /** null = no hay quincena abierta (ranking vacío). */
  private async range(input: TopWithdrawersInput): Promise<DateRange | null> {
    if (input.periodId)
      return periodRange(await getPeriodOrFail(this.periods, input.periodId), this.timeZone);
    const window = input.window ?? 'all';
    if (window !== 'period') return rankingRange(window, this.clock.now());
    const open = await this.periods.findOpen();
    return open ? periodRange(open, this.timeZone) : null;
  }
}
