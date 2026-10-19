import {
  ConsumptionCharge,
  Money,
  type ConsumptionChargeRepository,
  type ConsumptionChargeView,
} from '../../../../domain';
import type * as Db from '../generated/client';
import { toMoney, toUserRef, userRefSelect } from '../mappers';
import type { DbClient } from '../types';

const toCharge = (row: Db.ConsumptionCharge): ConsumptionCharge =>
  ConsumptionCharge.restore({
    id: row.id,
    periodId: row.periodId,
    userId: row.userId,
    amount: toMoney(row.amount),
    units: row.units,
    unpricedUnits: row.unpricedUnits,
    computedAt: row.computedAt,
  });

const viewInclude = {
  user: userRefSelect,
  period: { select: { id: true, name: true, endDate: true } },
  payments: { select: { amount: true } },
} as const;

type ViewRow = Db.ConsumptionCharge & {
  user: { id: string; name: string; lastname: string };
  period: { id: string; name: string; endDate: Date };
  payments: { amount: Db.Prisma.Decimal }[];
};

function toView(row: ViewRow): ConsumptionChargeView {
  return {
    id: row.id,
    period: { id: row.period.id, name: row.period.name },
    user: toUserRef(row.user),
    amount: toMoney(row.amount),
    units: row.units,
    unpricedUnits: row.unpricedUnits,
    computedAt: row.computedAt,
    paid: Money.sum(row.payments.map((p) => toMoney(p.amount))),
  };
}

export class PrismaConsumptionChargeRepository implements ConsumptionChargeRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.consumptionCharge.findUnique({ where: { id } });
    return row ? toCharge(row) : null;
  }

  async findByPeriod(periodId: string) {
    return (await this.db.consumptionCharge.findMany({ where: { periodId } })).map(toCharge);
  }

  async findViewsByPeriod(periodId: string) {
    const rows = await this.db.consumptionCharge.findMany({
      where: { periodId },
      include: viewInclude,
      orderBy: [{ amount: 'desc' }, { units: 'desc' }],
    });
    return rows.map(toView);
  }

  /** Pocos cobros abiertos a la vez (una o dos quincenas): se filtran en memoria por lo pagado. */
  async findPendingViews() {
    const rows = await this.db.consumptionCharge.findMany({
      where: { amount: { gt: 0 } },
      include: viewInclude,
      orderBy: [{ period: { endDate: 'asc' } }, { amount: 'desc' }],
    });
    return rows.map(toView).filter((charge) => charge.paid.cents < charge.amount.cents);
  }

  async paidAmount(chargeId: string) {
    const sum = await this.db.contribution.aggregate({ where: { chargeId }, _sum: { amount: true } });
    return sum._sum.amount ? toMoney(sum._sum.amount) : Money.zero();
  }

  async save(charge: ConsumptionCharge) {
    const data = {
      periodId: charge.periodId,
      userId: charge.userId,
      amount: charge.amount.toDecimalString(),
      units: charge.units,
      unpricedUnits: charge.unpricedUnits,
      computedAt: charge.computedAt,
    };
    await this.db.consumptionCharge.upsert({
      where: { id: charge.id },
      create: { id: charge.id, ...data },
      update: data,
    });
  }

  async delete(chargeId: string) {
    await this.db.consumptionCharge.delete({ where: { id: chargeId } });
  }
}
