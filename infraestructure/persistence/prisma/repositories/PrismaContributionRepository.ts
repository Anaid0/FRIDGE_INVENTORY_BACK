import type { Contribution, ContributionRepository, ContributionView } from '../../../../domain';
import { toMoney, toUserRef, userRefSelect } from '../mappers';
import type { DbClient } from '../types';

export class PrismaContributionRepository implements ContributionRepository {
  constructor(private readonly db: DbClient) {}

  async append(contribution: Contribution) {
    await this.db.contribution.create({
      data: {
        id: contribution.id,
        periodId: contribution.periodId,
        userId: contribution.userId,
        amount: contribution.amount.toDecimalString(),
        paidAt: contribution.paidAt,
        registeredBy: contribution.registeredBy,
        note: contribution.note,
        createdAt: contribution.createdAt,
      },
    });
  }

  async findByPeriod(periodId: string): Promise<ContributionView[]> {
    const rows = await this.db.contribution.findMany({
      where: { periodId },
      include: { user: userRefSelect, registrar: userRefSelect },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      periodId: row.periodId,
      user: toUserRef(row.user),
      amount: toMoney(row.amount),
      paidAt: row.paidAt,
      note: row.note,
      registeredBy: toUserRef(row.registrar),
      createdAt: row.createdAt,
    }));
  }
}
