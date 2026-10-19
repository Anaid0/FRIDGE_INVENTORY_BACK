import {
  Email,
  FundingPeriod,
  Money,
  Product,
  PurchaseItem,
  Quantity,
  Role,
  User,
  type Actor,
} from '../../../domain';

export const NOW = new Date('2026-10-16T12:00:00.000Z');
export const LATER = new Date('2026-10-17T12:00:00.000Z');

export const admin: Actor = { id: 'admin-1', role: Role.ADMIN };
export const employee: Actor = { id: 'emp-1', role: Role.EMPLOYEE };

export function makeAdmin(overrides: Partial<Parameters<typeof User.createAdmin>[0]> = {}): User {
  return User.createAdmin({
    id: 'admin-1',
    name: 'Ana',
    lastname: 'Pérez',
    email: Email.create('ana@oficina.com'),
    passwordHash: 'hash',
    now: NOW,
    ...overrides,
  });
}

export function makePerson(overrides: Partial<Parameters<typeof User.createPerson>[0]> = {}): User {
  return User.createPerson({
    id: 'person-1',
    name: 'Luis',
    lastname: 'Gómez',
    pinHash: 'pin-hash',
    now: NOW,
    ...overrides,
  });
}

export function makeProduct(
  stock = 0,
  overrides: Partial<Parameters<typeof Product.create>[0]> = {},
): Product {
  const product = Product.create({ id: 'prod-1', name: 'Gaseosa', minStock: 2, now: NOW, ...overrides });
  if (stock > 0) product.addStock(Quantity.create(stock), NOW);
  return product;
}

export function makeOpenPeriod(id = 'period-1'): FundingPeriod {
  return FundingPeriod.open({
    id,
    name: '2026-10 Q2',
    startDate: new Date('2026-10-16'),
    endDate: new Date('2026-10-31'),
    createdBy: admin.id,
    now: NOW,
  });
}

export function makeClosedPeriod(id = 'period-1'): FundingPeriod {
  const period = makeOpenPeriod(id);
  period.close(NOW);
  return period;
}

export function makeItem(id: string, productId: string, quantity: number, unitPrice: string): PurchaseItem {
  return PurchaseItem.create({
    id,
    productId,
    quantity: Quantity.create(quantity),
    unitPrice: Money.fromDecimal(unitPrice),
  });
}
