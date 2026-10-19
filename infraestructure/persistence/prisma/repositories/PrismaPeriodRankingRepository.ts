import { PeriodRanking, type PeriodRankingRepository, type RankingAuthor } from '../../../../domain';
import { toUserRef, userRefSelect } from '../mappers';
import type { DbClient } from '../types';

const withEntries = {
  entries: { orderBy: { sortOrder: 'asc' }, include: { user: userRefSelect } },
} as const;

type RankingRow = {
  periodId: string;
  computedAt: Date;
  computedBy: string | null;
  computedByDevice: string | null;
  entries: {
    position: number;
    totalWithdrawn: number;
    withdrawals: number;
    user: { id: string; name: string; lastname: string };
  }[];
};

function toAuthor(row: Pick<RankingRow, 'computedBy' | 'computedByDevice'>): RankingAuthor {
  if (row.computedBy) return { kind: 'user', id: row.computedBy };
  if (row.computedByDevice) return { kind: 'kiosk', id: row.computedByDevice };
  throw new Error('period_rankings sin autor: falta computed_by o computed_by_device');
}

function toRanking(row: RankingRow): PeriodRanking {
  return PeriodRanking.restore({
    periodId: row.periodId,
    computedAt: row.computedAt,
    computedBy: toAuthor(row),
    entries: row.entries.map((e) => ({
      position: e.position,
      user: toUserRef(e.user),
      totalWithdrawn: e.totalWithdrawn,
      withdrawals: e.withdrawals,
    })),
  });
}

export class PrismaPeriodRankingRepository implements PeriodRankingRepository {
  constructor(private readonly db: DbClient) {}

  async findByPeriod(periodId: string) {
    const row = await this.db.periodRanking.findUnique({ where: { periodId }, include: withEntries });
    return row ? toRanking(row) : null;
  }

  async findComputedPeriodIds() {
    const rows = await this.db.periodRanking.findMany({ select: { periodId: true } });
    return rows.map((r) => r.periodId);
  }

  async findLatest() {
    const row = await this.db.periodRanking.findFirst({
      orderBy: { period: { endDate: 'desc' } },
      include: withEntries,
    });
    return row ? toRanking(row) : null;
  }

  /** Una sola escritura anidada (atómica): reemplaza los puestos anteriores por los nuevos. */
  async save(ranking: PeriodRanking) {
    const entries = ranking.entries.map((e, index) => ({
      sortOrder: index + 1,
      position: e.position,
      userId: e.user.id,
      totalWithdrawn: e.totalWithdrawn,
      withdrawals: e.withdrawals,
    }));
    const author = ranking.computedBy;
    const data = {
      computedAt: ranking.computedAt,
      computedBy: author.kind === 'user' ? author.id : null,
      computedByDevice: author.kind === 'kiosk' ? author.id : null,
    };
    await this.db.periodRanking.upsert({
      where: { periodId: ranking.periodId },
      create: { periodId: ranking.periodId, ...data, entries: { create: entries } },
      update: { ...data, entries: { deleteMany: {}, create: entries } },
    });
  }
}
