import {
  Category,
  Contribution,
  Email,
  FundingPeriod,
  InventoryMovement,
  KioskDevice,
  Money,
  Product,
  Purchase,
  PurchaseItem,
  User,
  type UserRef,
} from '../../../../domain';
import type * as Db from '../generated/client';
import type { Prisma } from '../generated/client';

/** Prisma.Decimal (DECIMAL(12,2)) <-> Money. */
export const toMoney = (value: Prisma.Decimal): Money => Money.fromDecimal(value.toFixed(2));
export const toDecimalString = (money: Money): string => money.toDecimalString();

export const toUserRef = (row: Pick<Db.User, 'id' | 'name' | 'lastname'>): UserRef => ({
  id: row.id,
  name: row.name,
  lastname: row.lastname,
});

export const userRefSelect = { select: { id: true, name: true, lastname: true } } as const;

export function toUser(row: Db.User): User {
  return User.restore({
    id: row.id,
    name: row.name,
    lastname: row.lastname,
    email: row.email ? Email.create(row.email) : null,
    passwordHash: row.passwordHash,
    pinHash: row.pinHash,
    failedPinAttempts: row.failedPinAttempts,
    pinLockedUntil: row.pinLockedUntil,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function fromUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    lastname: user.lastname,
    email: user.email?.value ?? null,
    passwordHash: user.passwordHash,
    pinHash: user.pinHash,
    failedPinAttempts: user.failedPinAttempts,
    pinLockedUntil: user.pinLockedUntil,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const toCategory = (row: Db.Category): Category =>
  Category.restore({ id: row.id, name: row.name, createdAt: row.createdAt });

export function toProduct(row: Db.Product): Product {
  return Product.restore({
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit,
    quantity: row.quantity,
    minStock: row.minStock,
    categoryId: row.categoryId,
    referencePrice: row.referencePrice ? toMoney(row.referencePrice) : null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function fromProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    unit: product.unit,
    quantity: product.quantity,
    minStock: product.minStock,
    categoryId: product.categoryId,
    referencePrice: product.referencePrice?.toDecimalString() ?? null,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function toMovement(row: Db.InventoryMovement): InventoryMovement {
  return InventoryMovement.restore({
    id: row.id,
    productId: row.productId,
    type: row.type,
    source: row.source,
    quantity: row.quantity,
    stockBefore: row.stockBefore,
    stockAfter: row.stockAfter,
    performedBy: row.performedBy,
    registeredBy: row.registeredBy,
    note: row.note,
    purchaseItemId: row.purchaseItemId,
    unitPrice: row.unitPrice ? toMoney(row.unitPrice) : null,
    createdAt: row.createdAt,
  });
}

export function toPeriod(row: Db.FundingPeriod): FundingPeriod {
  return FundingPeriod.restore({
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    notes: row.notes,
    createdBy: row.createdBy,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function fromPeriod(period: FundingPeriod) {
  return {
    id: period.id,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    notes: period.notes,
    createdBy: period.createdBy,
    closedAt: period.closedAt,
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
  };
}

export function toContribution(row: Db.Contribution): Contribution {
  return Contribution.restore({
    id: row.id,
    periodId: row.periodId,
    userId: row.userId,
    amount: toMoney(row.amount),
    paidAt: row.paidAt,
    registeredBy: row.registeredBy,
    note: row.note,
    chargeId: row.chargeId,
    createdAt: row.createdAt,
  });
}

export function toPurchase(row: Db.Purchase & { items: Db.PurchaseItem[] }): Purchase {
  return Purchase.restore({
    id: row.id,
    periodId: row.periodId,
    buyerId: row.buyerId,
    store: row.store,
    purchasedAt: row.purchasedAt,
    items: row.items.map((item) =>
      PurchaseItem.restore({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: toMoney(item.unitPrice),
        subtotal: toMoney(item.subtotal),
        packageCount: item.packageCount,
        unitsPerPackage: item.unitsPerPackage,
      }),
    ),
    receiptPath: row.receiptPath,
    note: row.note,
    registeredBy: row.registeredBy,
    voidedAt: row.voidedAt,
    voidedBy: row.voidedBy,
    createdAt: row.createdAt,
  });
}

export function toKioskDevice(row: Db.KioskDevice): KioskDevice {
  return KioskDevice.restore({
    id: row.id,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
    revokedBy: row.revokedBy,
  });
}
