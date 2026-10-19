import type {
  FundingPeriodRepository,
  MovementRepository,
  MovementView,
  ProductRepository,
  TopWithdrawer,
} from '../../domain';
import { toPeriodSummaryDto, toProductDto, type PeriodSummaryDto, type ProductDto } from '../dto';
import type { Clock } from '../ports';
import { rankingRange } from '../shared/dates';

export interface DashboardSummaryDto {
  activeProducts: number;
  totalUnits: number;
  lowStockProducts: ProductDto[];
  /** El que más retira de todos los tiempos: se muestra siempre en la app. */
  topWithdrawer: TopWithdrawer | null;
  topWithdrawers: { allTime: TopWithdrawer[]; last30Days: TopWithdrawer[] };
  latestMovements: MovementView[];
  currentPeriod: PeriodSummaryDto | null;
}

const TOP = 3;
const LATEST = 10;

export class GetDashboardSummaryUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly movements: MovementRepository,
    private readonly periods: FundingPeriodRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<DashboardSummaryDto> {
    const now = this.clock.now();
    const [products, allTime, last30Days, latestMovements, openPeriod] = await Promise.all([
      this.products.findAll(),
      this.movements.findTopWithdrawers({}, TOP),
      this.movements.findTopWithdrawers(rankingRange('month', now), TOP),
      this.movements.findLatest(LATEST),
      this.periods.findOpen(),
    ]);
    const currentSummary = openPeriod ? await this.periods.findSummary(openPeriod.id) : null;

    return {
      activeProducts: products.length,
      totalUnits: products.reduce((sum, product) => sum + product.quantity, 0),
      lowStockProducts: products.filter((product) => product.isLowStock()).map((p) => toProductDto(p)),
      topWithdrawer: allTime[0] ?? null,
      topWithdrawers: { allTime, last30Days },
      latestMovements,
      currentPeriod: currentSummary ? toPeriodSummaryDto(currentSummary) : null,
    };
  }
}
