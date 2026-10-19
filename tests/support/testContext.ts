import { StockMovementRecorder } from '../../application';
import { Category, Email, FundingPeriod, Product, Role, User, type Actor } from '../../domain';
import {
  FakePasswordHasher,
  FakeTokenService,
  FixedClock,
  InMemoryFileStorage,
  InMemoryUnitOfWork,
  SequentialIdGenerator,
} from './fakes';
import { InMemoryDatabase } from './InMemoryDatabase';
import {
  InMemoryCategoryRepository,
  InMemoryConsumptionChargeRepository,
  InMemoryContributionRepository,
  InMemoryFundingPeriodRepository,
  InMemoryKioskDeviceRepository,
  InMemoryMovementRepository,
  InMemoryPeriodRankingRepository,
  InMemoryProductRepository,
  InMemoryPurchaseRepository,
  InMemorySpendingReportReader,
  InMemoryUserRepository,
} from './InMemoryRepositories';

export const START = new Date('2026-10-16T12:00:00.000Z');
/** Zona horaria de la oficina en los tests (UTC−5, sin horario de verano). */
export const TZ = 'America/Bogota';

export function actorOf(user: User): Actor {
  return { id: user.id, role: user.role };
}

/** Arma todas las dependencias en memoria y datos de ejemplo para un test. */
export function createTestContext() {
  const db = new InMemoryDatabase();
  const repos = {
    users: new InMemoryUserRepository(db),
    categories: new InMemoryCategoryRepository(db),
    products: new InMemoryProductRepository(db),
    movements: new InMemoryMovementRepository(db),
    periods: new InMemoryFundingPeriodRepository(db),
    contributions: new InMemoryContributionRepository(db),
    purchases: new InMemoryPurchaseRepository(db),
    reports: new InMemorySpendingReportReader(db),
    kioskDevices: new InMemoryKioskDeviceRepository(db),
    rankings: new InMemoryPeriodRankingRepository(db),
    charges: new InMemoryConsumptionChargeRepository(db),
  };
  const clock = new FixedClock(START);
  const ids = new SequentialIdGenerator();
  const hasher = new FakePasswordHasher();
  const tokens = new FakeTokenService();
  const storage = new InMemoryFileStorage();
  const uow = new InMemoryUnitOfWork(db, repos);
  const recorder = new StockMovementRecorder(ids);
  let seq = 0;

  /** ADMIN: cuenta con email + contraseña (Nevera123). EMPLOYEE: persona con PIN (2580 por defecto). */
  async function seedUser(input: {
    name: string;
    role?: Role;
    isActive?: boolean;
    password?: string;
    pin?: string;
  }) {
    seq += 1;
    const slug = input.name.toLowerCase().replace(/\s+/g, '.');
    const base = { id: `user-${slug}`, name: input.name, lastname: 'Test', now: clock.now() };
    const user =
      input.role === Role.ADMIN
        ? User.createAdmin({
            ...base,
            email: Email.create(`${slug}@oficina.com`),
            passwordHash: await hasher.hash(input.password ?? 'Nevera123'),
          })
        : User.createPerson({ ...base, pinHash: await hasher.hash(input.pin ?? '2580') });
    if (input.isActive === false) user.deactivate(clock.now());
    await repos.users.save(user);
    return user;
  }

  async function seedCategory(name: string) {
    const category = Category.create({ id: `cat-${name.toLowerCase()}`, name, now: clock.now() });
    await repos.categories.save(category);
    return category;
  }

  async function seedProduct(
    name: string,
    options: { stock?: number; minStock?: number; categoryId?: string | null; isActive?: boolean } = {},
  ) {
    const created = Product.create({
      id: `prod-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      minStock: options.minStock ?? 0,
      categoryId: options.categoryId ?? null,
      now: clock.now(),
    });
    const product = Product.restore({
      id: created.id,
      name: created.name,
      description: null,
      unit: created.unit,
      quantity: options.stock ?? 0,
      minStock: created.minStock,
      categoryId: created.categoryId,
      isActive: options.isActive ?? true,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
    await repos.products.save(product);
    return product;
  }

  async function seedPeriod(input: {
    id?: string;
    start?: string;
    end?: string;
    createdBy: string;
    closed?: boolean;
  }) {
    const period = FundingPeriod.open({
      id: input.id ?? 'period-1',
      name: `Quincena ${input.start ?? '2026-10-16'}`,
      startDate: new Date(input.start ?? '2026-10-16'),
      endDate: new Date(input.end ?? '2026-10-31'),
      createdBy: input.createdBy,
      now: clock.now(),
    });
    if (input.closed) period.close(clock.now());
    await repos.periods.save(period);
    return period;
  }

  async function stockOf(productId: string) {
    return (await repos.products.findById(productId))!.quantity;
  }

  return {
    db,
    repos,
    clock,
    ids,
    hasher,
    tokens,
    storage,
    uow,
    recorder,
    seedUser,
    seedCategory,
    seedProduct,
    seedPeriod,
    stockOf,
    seq: () => seq,
  };
}

export type TestContext = ReturnType<typeof createTestContext>;

/** Contexto con un admin y dos personas (Ana y Luis, PIN 2580). */
export async function createOfficeContext() {
  const ctx = createTestContext();
  const admin = await ctx.seedUser({ name: 'Admin', role: Role.ADMIN });
  const ana = await ctx.seedUser({ name: 'Ana' });
  const luis = await ctx.seedUser({ name: 'Luis' });
  return { ...ctx, admin, ana, luis, asAdmin: actorOf(admin), asAna: actorOf(ana), asLuis: actorOf(luis) };
}
