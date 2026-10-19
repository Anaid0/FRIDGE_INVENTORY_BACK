import {
  type Money,
  type Page,
  type PageRequest,
  type Purchase,
  type PurchaseFilter,
  type PurchaseListItem,
  type PurchaseRepository,
} from '../../../../domain';
import type { Prisma } from '../generated/client';
import { toMoney, toPurchase, toUserRef, userRefSelect } from '../mappers';
import type { DbClient } from '../types';

export class PrismaPurchaseRepository implements PurchaseRepository {
  constructor(private readonly db: DbClient) {}

  async findLatestUnitPrices(productIds: string[], at: Date): Promise<Map<string, Money>> {
    if (productIds.length === 0) return new Map();
    const items = await this.db.purchaseItem.findMany({
      where: {
        productId: { in: productIds },
        purchase: { voidedAt: null, purchasedAt: { lte: at } },
      },
      select: { productId: true, unitPrice: true },
      orderBy: [{ purchase: { purchasedAt: 'desc' } }, { purchase: { createdAt: 'desc' } }],
    });
    const prices = new Map<string, Money>();
    for (const item of items) {
      if (!prices.has(item.productId)) prices.set(item.productId, toMoney(item.unitPrice));
    }
    return prices;
  }

  async findById(id: string) {
    const row = await this.db.purchase.findUnique({ where: { id }, include: { items: true } });
    return row ? toPurchase(row) : null;
  }

  async findPage(filter: PurchaseFilter, page: PageRequest): Promise<Page<PurchaseListItem>> {
    const where: Prisma.PurchaseWhereInput = {
      periodId: filter.periodId,
      buyerId: filter.buyerId,
      ...(!filter.includeVoided && { voidedAt: null }),
      ...(filter.productId && { items: { some: { productId: filter.productId } } }),
      ...((filter.from || filter.to) && { purchasedAt: { gte: filter.from, lte: filter.to } }),
    };
    const [total, rows] = await Promise.all([
      this.db.purchase.count({ where }),
      this.db.purchase.findMany({
        where,
        include: {
          buyer: userRefSelect,
          period: { select: { name: true } },
          items: { select: { quantity: true, product: { select: { name: true } } }, orderBy: { id: 'asc' } },
        },
        orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        periodId: row.periodId,
        periodName: row.period.name,
        buyer: toUserRef(row.buyer),
        store: row.store,
        purchasedAt: row.purchasedAt,
        total: toMoney(row.total),
        itemsCount: row.items.length,
        lines: row.items.map((i) => ({ productName: i.product.name, quantity: i.quantity })),
        hasReceipt: row.receiptPath !== null,
        voidedAt: row.voidedAt,
        createdAt: row.createdAt,
      })),
      total,
      ...page,
    };
  }

  /**
   * Compra nueva: la inserta con sus líneas. Compra existente: solo actualiza lo que puede cambiar
   * (comprobante y anulación); las líneas son inmutables.
   */
  async save(purchase: Purchase) {
    const exists = await this.db.purchase.findUnique({ where: { id: purchase.id }, select: { id: true } });
    if (exists) {
      await this.db.purchase.update({
        where: { id: purchase.id },
        data: { receiptPath: purchase.receiptPath, voidedAt: purchase.voidedAt, voidedBy: purchase.voidedBy },
      });
      return;
    }
    await this.db.purchase.create({
      data: {
        id: purchase.id,
        periodId: purchase.periodId,
        buyerId: purchase.buyerId,
        store: purchase.store,
        purchasedAt: purchase.purchasedAt,
        total: purchase.total.toDecimalString(),
        receiptPath: purchase.receiptPath,
        note: purchase.note,
        registeredBy: purchase.registeredBy,
        voidedAt: purchase.voidedAt,
        voidedBy: purchase.voidedBy,
        createdAt: purchase.createdAt,
        items: {
          create: purchase.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toDecimalString(),
            subtotal: item.subtotal.toDecimalString(),
            packageCount: item.packageCount,
            unitsPerPackage: item.unitsPerPackage,
          })),
        },
      },
    });
  }
}
