import type { MovementFilter, MovementRepository, MovementView, Page, TopWithdrawer } from '../../domain';
import type { Clock } from '../ports';
import { rankingRange, type RankingWindow } from '../shared/dates';
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
  limit?: number;
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

/** Ranking de quién más retira productos (solo salidas manuales, por quien las realizó). */
export class GetTopWithdrawersUseCase {
  constructor(
    private readonly movements: MovementRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: TopWithdrawersInput = {}): Promise<TopWithdrawer[]> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    return this.movements.findTopWithdrawers(rankingRange(input.window ?? 'all', this.clock.now()), limit);
  }
}
