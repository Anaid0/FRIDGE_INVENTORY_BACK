import {
  buildPeriodSummary,
  Money,
  PeriodStatus,
  type FundingPeriod,
  type FundingPeriodRepository,
  type PeriodSummary,
} from '../../../../domain';
import type * as Db from '../generated/client';
import { fromPeriod, toMoney, toPeriod } from '../mappers';
import type { DbClient } from '../types';

export class PrismaFundingPeriodRepository implements FundingPeriodRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.fundingPeriod.findUnique({ where: { id } });
    return row ? toPeriod(row) : null;
  }

  async findOpen() {
    const row = await this.db.fundingPeriod.findFirst({ where: { status: PeriodStatus.OPEN } });
    return row ? toPeriod(row) : null;
  }

  async existsOverlapping(startDate: Date, endDate: Date, excludeId?: string) {
    const count = await this.db.fundingPeriod.count({
      where: {
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    return count > 0;
  }

  async findAllSummaries() {
    const periods = await this.db.fundingPeriod.findMany({ orderBy: { startDate: 'desc' } });
    return this.summarize(periods);
  }

  async findSummary(periodId: string) {
    const period = await this.db.fundingPeriod.findUnique({ where: { id: periodId } });
    if (!period) return null;
    const [summary] = await this.summarize([period]);
    return summary ?? null;
  }

  async save(period: FundingPeriod) {
    const data = fromPeriod(period);
    await this.db.fundingPeriod.upsert({ where: { id: period.id }, create: data, update: data });
  }

  /** Recaudado = suma de aportes; gastado = suma de compras NO anuladas. */
  private async summarize(periods: Db.FundingPeriod[]): Promise<PeriodSummary[]> {
    if (periods.length === 0) return [];
    const ids = periods.map((p) => p.id);
    const [collected, spent] = await Promise.all([
      this.db.contribution.groupBy({
        by: ['periodId'],
        where: { periodId: { in: ids } },
        _sum: { amount: true },
      }),
      this.db.purchase.groupBy({
        by: ['periodId'],
        where: { periodId: { in: ids }, voidedAt: null },
        _sum: { total: true },
      }),
    ]);
    const collectedBy = new Map(collected.map((g) => [g.periodId, g._sum.amount]));
    const spentBy = new Map(spent.map((g) => [g.periodId, g._sum.total]));
    return periods.map((period) => {
      const c = collectedBy.get(period.id);
      const s = spentBy.get(period.id);
      return buildPeriodSummary(period, c ? toMoney(c) : Money.zero(), s ? toMoney(s) : Money.zero());
    });
  }
}
