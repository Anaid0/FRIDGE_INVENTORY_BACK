import type { ConsumptionCharge } from '../../domain';
import {
  buildPeriodSummary,
  Money,
  valueConsumption,
  MovementSource,
  MovementType,
  type Category,
  type CategoryRepository,
  type CategorySpending,
  type ConsumptionChargeRepository,
  type ConsumptionChargeView,
  type Contribution,
  type ContributionRepository,
  type ContributionView,
  type DateRange,
  type FundingPeriod,
  type FundingPeriodRepository,
  type InventoryMovement,
  type KioskDevice,
  type KioskDeviceRepository,
  type MovementFilter,
  type MovementRepository,
  type MovementView,
  type Page,
  type PageRequest,
  type PeriodRanking,
  type PeriodRankingRepository,
  type PeriodSummary,
  type PersonActivity,
  type PersonConsumption,
  type PricePoint,
  type Product,
  type ProductFilter,
  type ProductRepository,
  type ProductSpending,
  type Purchase,
  type PurchaseFilter,
  type PurchaseListItem,
  type PurchaseRepository,
  type ReportScope,
  type SpendingReportReader,
  type TopWithdrawer,
  type User,
  type UserFilter,
  type UserRef,
  type UserRepository,
} from '../../domain';
import { clone, type InMemoryDatabase } from './InMemoryDatabase';

const sameText = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
const contains = (text: string, search: string) => text.toLowerCase().includes(search.toLowerCase());
const inRange = (date: Date, range: DateRange) =>
  (!range.from || date >= range.from) && (!range.to || date <= range.to);

function paginate<T>(items: T[], page: PageRequest): Page<T> {
  const start = (page.page - 1) * page.pageSize;
  return { items: items.slice(start, start + page.pageSize), total: items.length, ...page };
}

function userRef(db: InMemoryDatabase, id: string): UserRef {
  const user = db.users.get(id);
  if (!user) throw new Error(`Usuario ${id} no existe en la BD en memoria`);
  return { id: user.id, name: user.name, lastname: user.lastname };
}

export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: string) {
    const user = this.db.users.get(id);
    return user ? clone.user(user) : null;
  }
  async findByEmail(email: string) {
    const user = [...this.db.users.values()].find((u) => u.email !== null && sameText(u.email.value, email));
    return user ? clone.user(user) : null;
  }
  async findAll(filter: UserFilter = {}) {
    return [...this.db.users.values()]
      .filter((u) => filter.role === undefined || u.role === filter.role)
      .filter((u) => filter.isActive === undefined || u.isActive === filter.isActive)
      .filter((u) => !filter.search || contains(`${u.fullName} ${u.email?.value ?? ''}`, filter.search))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(clone.user);
  }
  async countActiveAdmins() {
    return [...this.db.users.values()].filter((u) => u.isAdmin() && u.isActive).length;
  }
  async save(user: User) {
    this.db.users.set(user.id, clone.user(user));
  }
}

export class InMemoryCategoryRepository implements CategoryRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: string) {
    const category = this.db.categories.get(id);
    return category ? clone.category(category) : null;
  }
  async findByName(name: string) {
    const category = [...this.db.categories.values()].find((c) => sameText(c.name, name));
    return category ? clone.category(category) : null;
  }
  async findAll() {
    return [...this.db.categories.values()].sort((a, b) => a.name.localeCompare(b.name)).map(clone.category);
  }
  async save(category: Category) {
    this.db.categories.set(category.id, clone.category(category));
  }
}

export class InMemoryProductRepository implements ProductRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: string) {
    const product = this.db.products.get(id);
    return product ? clone.product(product) : null;
  }
  async findByIdForUpdate(id: string) {
    return this.findById(id);
  }
  async findByName(name: string) {
    const product = [...this.db.products.values()].find((p) => sameText(p.name, name));
    return product ? clone.product(product) : null;
  }
  async findByCode(code: string) {
    const product = [...this.db.products.values()].find((p) => p.code === code.trim());
    return product ? clone.product(product) : null;
  }
  async findTakenCodes() {
    return [...this.db.products.values()].flatMap((p) => (p.code ? [p.code] : []));
  }
  async findAll(filter: ProductFilter = {}) {
    return [...this.db.products.values()]
      .filter((p) => filter.includeInactive || p.isActive)
      .filter(
        (p) => !filter.search || contains(p.name, filter.search) || contains(p.code ?? '', filter.search),
      )
      .filter((p) => !filter.categoryId || p.categoryId === filter.categoryId)
      .filter((p) => !filter.lowStock || p.isLowStock())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(clone.product);
  }
  async save(product: Product) {
    this.db.products.set(product.id, clone.product(product));
  }
}

export class InMemoryMovementRepository implements MovementRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async append(movement: InventoryMovement) {
    this.db.movements.push(movement);
  }

  async findPage(filter: MovementFilter, page: PageRequest) {
    const items = this.newestFirst()
      .filter((m) => !filter.type || m.type === filter.type)
      .filter((m) => !filter.source || m.source === filter.source)
      .filter((m) => !filter.performedBy || m.performedBy === filter.performedBy)
      .filter((m) => !filter.registeredBy || m.registeredBy === filter.registeredBy)
      .filter((m) => !filter.productId || m.productId === filter.productId)
      .filter((m) => inRange(m.createdAt, filter))
      .map((m) => this.toView(m));
    return paginate(items, page);
  }

  async findLatest(limit: number) {
    return this.newestFirst()
      .slice(0, limit)
      .map((m) => this.toView(m));
  }

  async findConsumptionByPerson(range: DateRange): Promise<PersonConsumption[]> {
    return valueConsumption(
      this.db.movements
        .filter((m) => m.isWithdrawal() && inRange(m.createdAt, range))
        .map((m) => ({
          userId: m.performedBy,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          referencePrice: this.db.products.get(m.productId)?.referencePrice ?? null,
        })),
    );
  }

  async findActivityByPerson(range: DateRange): Promise<PersonActivity[]> {
    const byUser = new Map<string, PersonActivity>();
    for (const m of this.db.movements) {
      if (m.source !== MovementSource.MANUAL || !inRange(m.createdAt, range)) continue;
      const row = byUser.get(m.performedBy) ?? { userId: m.performedBy, withdrawn: 0, stored: 0 };
      if (m.type === MovementType.OUT) row.withdrawn += m.quantity;
      else row.stored += m.quantity;
      byUser.set(m.performedBy, row);
    }
    return [...byUser.values()];
  }

  async findTopWithdrawers(range: DateRange, limit: number): Promise<TopWithdrawer[]> {
    const totals = new Map<string, TopWithdrawer>();
    for (const m of this.db.movements) {
      if (m.type !== MovementType.OUT || m.source !== MovementSource.MANUAL || !inRange(m.createdAt, range))
        continue;
      const row = totals.get(m.performedBy) ?? {
        user: userRef(this.db, m.performedBy),
        totalWithdrawn: 0,
        withdrawals: 0,
      };
      row.totalWithdrawn += m.quantity;
      row.withdrawals += 1;
      totals.set(m.performedBy, row);
    }
    return [...totals.values()]
      .sort((a, b) => b.totalWithdrawn - a.totalWithdrawn || b.withdrawals - a.withdrawals)
      .slice(0, limit);
  }

  private newestFirst() {
    return this.db.movements
      .map((m, index) => ({ m, index }))
      .sort((a, b) => b.m.createdAt.getTime() - a.m.createdAt.getTime() || b.index - a.index)
      .map(({ m }) => m);
  }

  private toView(m: InventoryMovement): MovementView {
    const product = this.db.products.get(m.productId)!;
    const purchase = m.purchaseItemId
      ? [...this.db.purchases.values()].find((p) => p.items.some((i) => i.id === m.purchaseItemId))
      : undefined;
    return {
      id: m.id,
      type: m.type,
      source: m.source,
      quantity: m.quantity,
      stockBefore: m.stockBefore,
      stockAfter: m.stockAfter,
      note: m.note,
      createdAt: m.createdAt,
      product: { id: product.id, name: product.name, unit: product.unit },
      performedBy: userRef(this.db, m.performedBy),
      registeredBy: userRef(this.db, m.registeredBy),
      purchaseId: purchase?.id ?? null,
      unitPrice: m.unitPrice ?? purchase?.items.find((i) => i.id === m.purchaseItemId)?.unitPrice ?? null,
    };
  }
}

export class InMemoryFundingPeriodRepository implements FundingPeriodRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: string) {
    const period = this.db.periods.get(id);
    return period ? clone.period(period) : null;
  }
  async findOpen() {
    const period = [...this.db.periods.values()].find((p) => p.isOpen());
    return period ? clone.period(period) : null;
  }
  async existsOverlapping(startDate: Date, endDate: Date, excludeId?: string) {
    return [...this.db.periods.values()].some(
      (p) => p.id !== excludeId && startDate <= p.endDate && endDate >= p.startDate,
    );
  }
  async findAllSummaries() {
    return [...this.db.periods.values()]
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
      .map((p) => this.summarize(p));
  }
  async findSummary(periodId: string) {
    const period = this.db.periods.get(periodId);
    return period ? this.summarize(period) : null;
  }
  async save(period: FundingPeriod) {
    this.db.periods.set(period.id, clone.period(period));
  }

  private summarize(period: FundingPeriod): PeriodSummary {
    const collected = Money.sum(
      this.db.contributions.filter((c) => c.periodId === period.id).map((c) => c.amount),
    );
    const spent = Money.sum(
      [...this.db.purchases.values()]
        .filter((p) => p.periodId === period.id && !p.isVoided())
        .map((p) => p.total),
    );
    return buildPeriodSummary(period, collected, spent);
  }
}

export class InMemoryContributionRepository implements ContributionRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async append(contribution: Contribution) {
    this.db.contributions.push(contribution);
  }
  async findByPeriod(periodId: string): Promise<ContributionView[]> {
    return this.db.contributions
      .filter((c) => c.periodId === periodId)
      .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
      .map((c) => ({
        id: c.id,
        periodId: c.periodId,
        user: userRef(this.db, c.userId),
        amount: c.amount,
        paidAt: c.paidAt,
        note: c.note,
        charge: c.chargeId
          ? {
              id: c.chargeId,
              periodId: this.db.charges.get(c.chargeId)!.periodId,
              periodName: this.db.periods.get(this.db.charges.get(c.chargeId)!.periodId)!.name,
            }
          : null,
        registeredBy: userRef(this.db, c.registeredBy),
        createdAt: c.createdAt,
      }));
  }
}

export class InMemoryPurchaseRepository implements PurchaseRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findLatestUnitPrices(productIds: string[], at: Date): Promise<Map<string, Money>> {
    const prices = new Map<string, Money>();
    const latest = [...this.db.purchases.values()]
      .filter((p) => !p.isVoided() && p.purchasedAt.getTime() <= at.getTime())
      .sort((a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime());
    for (const purchase of latest) {
      for (const item of purchase.items) {
        if (productIds.includes(item.productId) && !prices.has(item.productId)) {
          prices.set(item.productId, item.unitPrice);
        }
      }
    }
    return prices;
  }

  async findById(id: string) {
    const purchase = this.db.purchases.get(id);
    return purchase ? clone.purchase(purchase) : null;
  }
  async findPage(filter: PurchaseFilter, page: PageRequest): Promise<Page<PurchaseListItem>> {
    const items = [...this.db.purchases.values()]
      .filter((p) => filter.includeVoided || !p.isVoided())
      .filter((p) => !filter.periodId || p.periodId === filter.periodId)
      .filter((p) => !filter.buyerId || p.buyerId === filter.buyerId)
      .filter((p) => !filter.productId || p.items.some((i) => i.productId === filter.productId))
      .filter((p) => inRange(p.purchasedAt, filter))
      .sort((a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime())
      .map((p) => ({
        id: p.id,
        periodId: p.periodId,
        periodName: this.db.periods.get(p.periodId)!.name,
        buyer: userRef(this.db, p.buyerId),
        store: p.store,
        purchasedAt: p.purchasedAt,
        total: p.total,
        itemsCount: p.items.length,
        lines: p.items.map((i) => ({
          productName: this.db.products.get(i.productId)?.name ?? '',
          quantity: i.quantity,
        })),
        hasReceipt: p.receiptPath !== null,
        voidedAt: p.voidedAt,
        createdAt: p.createdAt,
      }));
    return paginate(items, page);
  }
  async save(purchase: Purchase) {
    this.db.purchases.set(purchase.id, clone.purchase(purchase));
  }
}

export class InMemorySpendingReportReader implements SpendingReportReader {
  constructor(private readonly db: InMemoryDatabase) {}

  async spendingByProduct(scope: ReportScope): Promise<ProductSpending[]> {
    const rows = new Map<string, { units: number; spent: Money; priceSum: Money; lines: number }>();
    for (const item of this.items(scope)) {
      const row = rows.get(item.productId) ?? {
        units: 0,
        spent: Money.zero(),
        priceSum: Money.zero(),
        lines: 0,
      };
      row.units += item.quantity;
      row.spent = row.spent.add(item.subtotal);
      row.priceSum = row.priceSum.add(item.unitPrice);
      row.lines += 1;
      rows.set(item.productId, row);
    }
    return [...rows.entries()]
      .map(([productId, row]) => ({
        productId,
        productName: this.db.products.get(productId)!.name,
        units: row.units,
        spent: row.spent,
        averageUnitPrice: Money.fromCents(Math.round(row.priceSum.cents / row.lines)),
      }))
      .sort((a, b) => b.spent.cents - a.spent.cents);
  }

  async spendingByCategory(scope: ReportScope): Promise<CategorySpending[]> {
    const rows = new Map<string | null, CategorySpending>();
    for (const item of this.items(scope)) {
      const categoryId = this.db.products.get(item.productId)!.categoryId;
      const row = rows.get(categoryId) ?? {
        categoryId,
        categoryName: categoryId ? this.db.categories.get(categoryId)!.name : 'Sin categoría',
        units: 0,
        spent: Money.zero(),
      };
      row.units += item.quantity;
      row.spent = row.spent.add(item.subtotal);
      rows.set(categoryId, row);
    }
    return [...rows.values()].sort((a, b) => b.spent.cents - a.spent.cents);
  }

  async priceHistory(productId: string, range: DateRange = {}): Promise<PricePoint[]> {
    return this.activePurchases()
      .filter((p) => inRange(p.purchasedAt, range))
      .flatMap((p) =>
        p.items
          .filter((i) => i.productId === productId)
          .map((i) => ({
            purchaseId: p.id,
            purchasedAt: p.purchasedAt,
            unitPrice: i.unitPrice,
            store: p.store,
          })),
      )
      .sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
  }

  private activePurchases() {
    return [...this.db.purchases.values()].filter((p) => !p.isVoided());
  }

  private items(scope: ReportScope) {
    return this.activePurchases()
      .filter((p) => ('periodId' in scope ? p.periodId === scope.periodId : inRange(p.purchasedAt, scope)))
      .flatMap((p) => p.items);
  }
}

export class InMemoryKioskDeviceRepository implements KioskDeviceRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: string) {
    const device = this.db.kioskDevices.get(id);
    return device ? clone.kioskDevice(device) : null;
  }
  async findAll() {
    return [...this.db.kioskDevices.values()]
      .sort(
        (a, b) =>
          Number(!a.isActive()) - Number(!b.isActive()) || b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .map(clone.kioskDevice);
  }
  async save(device: KioskDevice) {
    this.db.kioskDevices.set(device.id, clone.kioskDevice(device));
  }
}

export class InMemoryPeriodRankingRepository implements PeriodRankingRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findByPeriod(periodId: string) {
    return this.db.rankings.get(periodId) ?? null;
  }
  async findLatest() {
    const endOf = (r: PeriodRanking) => this.db.periods.get(r.periodId)?.endDate.getTime() ?? 0;
    return [...this.db.rankings.values()].sort((a, b) => endOf(b) - endOf(a))[0] ?? null;
  }
  async findComputedPeriodIds() {
    return [...this.db.rankings.keys()];
  }
  async save(ranking: PeriodRanking) {
    this.db.rankings.set(ranking.periodId, ranking);
  }
}

export class InMemoryConsumptionChargeRepository implements ConsumptionChargeRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findById(id: string) {
    const charge = this.db.charges.get(id);
    return charge ? clone.charge(charge) : null;
  }
  async findByPeriod(periodId: string) {
    return [...this.db.charges.values()].filter((c) => c.periodId === periodId).map(clone.charge);
  }
  async findViewsByPeriod(periodId: string) {
    return [...this.db.charges.values()]
      .filter((c) => c.periodId === periodId)
      .map((c) => this.toView(c))
      .sort((a, b) => b.amount.cents - a.amount.cents || b.units - a.units);
  }
  async findPendingViews() {
    const endOf = (v: ConsumptionChargeView) => this.db.periods.get(v.period.id)!.endDate.getTime();
    return [...this.db.charges.values()]
      .map((c) => this.toView(c))
      .filter((v) => v.paid.cents < v.amount.cents)
      .sort((a, b) => endOf(a) - endOf(b) || b.amount.cents - a.amount.cents);
  }
  async paidAmount(chargeId: string) {
    return Money.sum(this.db.contributions.filter((c) => c.chargeId === chargeId).map((c) => c.amount));
  }
  async save(charge: ConsumptionCharge) {
    this.db.charges.set(charge.id, clone.charge(charge));
  }
  async delete(chargeId: string) {
    this.db.charges.delete(chargeId);
  }

  private toView(charge: ConsumptionCharge): ConsumptionChargeView {
    const period = this.db.periods.get(charge.periodId)!;
    return {
      id: charge.id,
      period: { id: period.id, name: period.name },
      user: userRef(this.db, charge.userId),
      amount: charge.amount,
      units: charge.units,
      unpricedUnits: charge.unpricedUnits,
      computedAt: charge.computedAt,
      paid: Money.sum(this.db.contributions.filter((c) => c.chargeId === charge.id).map((c) => c.amount)),
    };
  }
}
