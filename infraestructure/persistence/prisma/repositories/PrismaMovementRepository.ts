import {
  MovementSource,
  MovementType,
  type DateRange,
  type InventoryMovement,
  type MovementFilter,
  type MovementRepository,
  type MovementView,
  type Page,
  type PageRequest,
  type TopWithdrawer,
} from '../../../../domain';
import type { Prisma } from '../generated/client';
import { toUserRef, userRefSelect } from '../mappers';
import type { DbClient } from '../types';

const viewInclude = {
  product: { select: { id: true, name: true, unit: true } },
  performer: userRefSelect,
  registrar: userRefSelect,
  purchaseItem: { select: { purchaseId: true } },
} satisfies Prisma.InventoryMovementInclude;

type MovementRow = Prisma.InventoryMovementGetPayload<{ include: typeof viewInclude }>;

const newestFirst = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.InventoryMovementOrderByWithRelationInput[];

function dateFilter(range: DateRange): Prisma.DateTimeFilter | undefined {
  if (!range.from && !range.to) return undefined;
  return { gte: range.from, lte: range.to };
}

function toView(row: MovementRow): MovementView {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    quantity: row.quantity,
    stockBefore: row.stockBefore,
    stockAfter: row.stockAfter,
    note: row.note,
    createdAt: row.createdAt,
    product: row.product,
    performedBy: toUserRef(row.performer),
    registeredBy: toUserRef(row.registrar),
    purchaseId: row.purchaseItem?.purchaseId ?? null,
  };
}

export class PrismaMovementRepository implements MovementRepository {
  constructor(private readonly db: DbClient) {}

  async append(movement: InventoryMovement) {
    await this.db.inventoryMovement.create({
      data: {
        id: movement.id,
        productId: movement.productId,
        type: movement.type,
        source: movement.source,
        quantity: movement.quantity,
        stockBefore: movement.stockBefore,
        stockAfter: movement.stockAfter,
        performedBy: movement.performedBy,
        registeredBy: movement.registeredBy,
        note: movement.note,
        purchaseItemId: movement.purchaseItemId,
        createdAt: movement.createdAt,
      },
    });
  }

  async findPage(filter: MovementFilter, page: PageRequest): Promise<Page<MovementView>> {
    const where: Prisma.InventoryMovementWhereInput = {
      type: filter.type,
      source: filter.source,
      performedBy: filter.performedBy,
      registeredBy: filter.registeredBy,
      productId: filter.productId,
      createdAt: dateFilter(filter),
    };
    const [total, rows] = await Promise.all([
      this.db.inventoryMovement.count({ where }),
      this.db.inventoryMovement.findMany({
        where,
        include: viewInclude,
        orderBy: newestFirst,
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
    ]);
    return { items: rows.map(toView), total, ...page };
  }

  async findLatest(limit: number) {
    const rows = await this.db.inventoryMovement.findMany({
      include: viewInclude,
      orderBy: newestFirst,
      take: limit,
    });
    return rows.map(toView);
  }

  async findTopWithdrawers(range: DateRange, limit: number): Promise<TopWithdrawer[]> {
    const groups = await this.db.inventoryMovement.groupBy({
      by: ['performedBy'],
      where: { type: MovementType.OUT, source: MovementSource.MANUAL, createdAt: dateFilter(range) },
      _sum: { quantity: true },
      _count: { _all: true },
      orderBy: [{ _sum: { quantity: 'desc' } }, { _count: { performedBy: 'desc' } }],
      take: limit,
    });
    if (groups.length === 0) return [];

    const users = await this.db.user.findMany({
      where: { id: { in: groups.map((g) => g.performedBy) } },
      ...userRefSelect,
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return groups.map((g) => ({
      user: toUserRef(byId.get(g.performedBy)!),
      totalWithdrawn: g._sum.quantity ?? 0,
      withdrawals: g._count._all,
    }));
  }
}
