import {
  Money,
  type CategorySpending,
  type DateRange,
  type PricePoint,
  type ProductSpending,
  type ReportScope,
  type SpendingReportReader,
} from '../../../../domain';
import type { Prisma } from '../generated/client';
import { toMoney } from '../mappers';
import type { DbClient } from '../types';

function purchaseWhere(scope: ReportScope): Prisma.PurchaseWhereInput {
  if ('periodId' in scope) return { voidedAt: null, periodId: scope.periodId };
  const hasRange = scope.from || scope.to;
  return { voidedAt: null, ...(hasRange && { purchasedAt: { gte: scope.from, lte: scope.to } }) };
}

/** Promedio de Prisma (Decimal con muchos decimales) redondeado a centavos. */
function roundToMoney(value: Prisma.Decimal | null): Money {
  return value ? Money.fromCents(Math.round(Number(value.toString()) * 100)) : Money.zero();
}

export class PrismaSpendingReportReader implements SpendingReportReader {
  constructor(private readonly db: DbClient) {}

  async spendingByProduct(scope: ReportScope): Promise<ProductSpending[]> {
    const groups = await this.db.purchaseItem.groupBy({
      by: ['productId'],
      where: { purchase: purchaseWhere(scope) },
      _sum: { quantity: true, subtotal: true },
      _avg: { unitPrice: true },
      orderBy: { _sum: { subtotal: 'desc' } },
    });
    if (groups.length === 0) return [];

    const products = await this.db.product.findMany({
      where: { id: { in: groups.map((g) => g.productId) } },
      select: { id: true, name: true },
    });
    const names = new Map(products.map((p) => [p.id, p.name]));
    return groups.map((g) => ({
      productId: g.productId,
      productName: names.get(g.productId) ?? '',
      units: g._sum.quantity ?? 0,
      spent: g._sum.subtotal ? toMoney(g._sum.subtotal) : Money.zero(),
      averageUnitPrice: roundToMoney(g._avg.unitPrice),
    }));
  }

  async spendingByCategory(scope: ReportScope): Promise<CategorySpending[]> {
    const byProduct = await this.spendingByProduct(scope);
    if (byProduct.length === 0) return [];

    const products = await this.db.product.findMany({
      where: { id: { in: byProduct.map((p) => p.productId) } },
      select: { id: true, category: { select: { id: true, name: true } } },
    });
    const categoryOf = new Map(products.map((p) => [p.id, p.category]));

    const rows = new Map<string | null, CategorySpending>();
    for (const item of byProduct) {
      const category = categoryOf.get(item.productId) ?? null;
      const key = category?.id ?? null;
      const row = rows.get(key) ?? {
        categoryId: key,
        categoryName: category?.name ?? 'Sin categoría',
        units: 0,
        spent: Money.zero(),
      };
      row.units += item.units;
      row.spent = row.spent.add(item.spent);
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.spent.cents - a.spent.cents);
  }

  async priceHistory(productId: string, range: DateRange = {}): Promise<PricePoint[]> {
    const rows = await this.db.purchaseItem.findMany({
      where: { productId, purchase: purchaseWhere(range) },
      select: { unitPrice: true, purchase: { select: { id: true, purchasedAt: true, store: true } } },
      orderBy: { purchase: { purchasedAt: 'asc' } },
    });
    return rows.map((row) => ({
      purchaseId: row.purchase.id,
      purchasedAt: row.purchase.purchasedAt,
      unitPrice: toMoney(row.unitPrice),
      store: row.purchase.store,
    }));
  }
}
