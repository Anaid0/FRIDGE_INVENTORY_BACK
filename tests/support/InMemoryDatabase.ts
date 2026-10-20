import {
  Category,
  ConsumptionCharge,
  FundingPeriod,
  KioskDevice,
  Product,
  Purchase,
  User,
  type Contribution,
  type InventoryMovement,
  type PeriodRanking,
} from '../../domain';

/**
 * "Base de datos" en memoria para los tests de aplicación.
 * Los repositorios guardan y devuelven COPIAS de las entidades (como una BD real),
 * así que una entidad modificada sin `save` no cambia lo guardado.
 */
export class InMemoryDatabase {
  users = new Map<string, User>();
  categories = new Map<string, Category>();
  products = new Map<string, Product>();
  movements: InventoryMovement[] = []; // inmutables
  periods = new Map<string, FundingPeriod>();
  contributions: Contribution[] = []; // inmutables
  purchases = new Map<string, Purchase>();
  kioskDevices = new Map<string, KioskDevice>();
  rankings = new Map<string, PeriodRanking>(); // por periodId; se reemplazan enteros
  charges = new Map<string, ConsumptionCharge>();

  /** Copia superficial suficiente: lo guardado nunca se muta en el lugar. */
  snapshot() {
    return {
      users: new Map(this.users),
      categories: new Map(this.categories),
      products: new Map(this.products),
      movements: [...this.movements],
      periods: new Map(this.periods),
      contributions: [...this.contributions],
      purchases: new Map(this.purchases),
      kioskDevices: new Map(this.kioskDevices),
      rankings: new Map(this.rankings),
      charges: new Map(this.charges),
    };
  }

  restore(snapshot: ReturnType<InMemoryDatabase['snapshot']>): void {
    Object.assign(this, snapshot);
  }
}

export const clone = {
  charge: (c: ConsumptionCharge) =>
    ConsumptionCharge.restore({
      id: c.id,
      periodId: c.periodId,
      userId: c.userId,
      amount: c.amount,
      units: c.units,
      unpricedUnits: c.unpricedUnits,
      computedAt: c.computedAt,
    }),
  user: (u: User) =>
    User.restore({
      id: u.id,
      name: u.name,
      lastname: u.lastname,
      email: u.email,
      passwordHash: u.passwordHash,
      pinHash: u.pinHash,
      failedPinAttempts: u.failedPinAttempts,
      pinLockedUntil: u.pinLockedUntil,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }),
  category: (c: Category) => Category.restore({ id: c.id, name: c.name, createdAt: c.createdAt }),
  product: (p: Product) =>
    Product.restore({
      id: p.id,
      name: p.name,
      description: p.description,
      unit: p.unit,
      quantity: p.quantity,
      minStock: p.minStock,
      categoryId: p.categoryId,
      referencePrice: p.referencePrice,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }),
  period: (p: FundingPeriod) =>
    FundingPeriod.restore({
      id: p.id,
      name: p.name,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      notes: p.notes,
      createdBy: p.createdBy,
      closedAt: p.closedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }),
  kioskDevice: (d: KioskDevice) =>
    KioskDevice.restore({
      id: d.id,
      name: d.name,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      revokedAt: d.revokedAt,
      revokedBy: d.revokedBy,
      failedPinAttempts: d.failedPinAttempts,
      pinLockedUntil: d.pinLockedUntil,
    }),
  purchase: (p: Purchase) =>
    Purchase.restore({
      id: p.id,
      periodId: p.periodId,
      buyerId: p.buyerId,
      store: p.store,
      purchasedAt: p.purchasedAt,
      items: [...p.items],
      receiptPath: p.receiptPath,
      note: p.note,
      registeredBy: p.registeredBy,
      voidedAt: p.voidedAt,
      voidedBy: p.voidedBy,
      createdAt: p.createdAt,
    }),
};
