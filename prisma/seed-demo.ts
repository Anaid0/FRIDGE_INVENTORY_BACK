import { loadEnv } from '../infraestructure/config/env';
import { createContainer } from '../infraestructure/config/container';
import { Role, type Actor } from '../domain';

/**
 * Datos de DEMOSTRACIÓN para desarrollo (no usar en producción).
 * Usa los casos de uso reales, así que respeta todas las reglas del dominio.
 * Requiere haber corrido `npm run db:seed` (admin inicial). Si ya hay productos, no hace nada.
 *
 * Personas demo para la tablet (nombre + PIN):
 *   Ana Gómez → 2580 · Luis Martínez → 3691 · Marta Ríos → 4826
 */
const DEMO_PEOPLE = [
  { name: 'Ana', lastname: 'Gómez', pin: '2580' },
  { name: 'Luis', lastname: 'Martínez', pin: '3691' },
  { name: 'Marta', lastname: 'Ríos', pin: '4826' },
] as const;

async function main() {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') throw new Error('El seed de demo no se ejecuta en producción');
  // En los e2e corre con NODE_ENV=test; en cualquier caso nunca contra producción.
  const { useCases: uc, close } = createContainer(env);

  try {
    if ((await uc.listProducts.execute({ includeInactive: true })).length > 0) {
      console.log('✔ Ya hay productos: el seed de demo no hace nada.');
      return;
    }
    const login = await uc.login.execute({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    const admin: Actor = { id: login.user.id, role: Role.ADMIN };

    const [ana, luis, marta] = await Promise.all(
      DEMO_PEOPLE.map((person) => uc.registerPerson.execute(person, admin)),
    );

    const categories = Object.fromEntries((await uc.listCategories.execute()).map((c) => [c.name, c.id]));
    const create = (name: string, category: string, unit: string, minStock: number) =>
      uc.createProduct.execute({ name, unit, minStock, categoryId: categories[category] ?? null }, admin);
    const gaseosa = await create('Gaseosa 400 ml', 'Bebidas', 'botella', 4);
    const agua = await create('Agua con gas', 'Bebidas', 'botella', 3);
    const yogur = await create('Yogur de fresa', 'Lácteos', 'unidad', 3);
    const papas = await create('Papas fritas', 'Snacks', 'paquete', 5);
    const manzanas = await create('Manzanas', 'Frutas', 'unidad', 4);

    const now = new Date();
    const firstHalf = now.getDate() <= 15;
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), firstHalf ? 1 : 16));
    const end = firstHalf
      ? new Date(Date.UTC(now.getFullYear(), now.getMonth(), 15))
      : new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
    const period = await uc.openFundingPeriod.execute(
      { name: 'Quincena de demostración', startDate: start, endDate: end },
      admin,
    );

    for (const [user, amount] of [
      [ana, '40000'],
      [luis, '40000'],
      [marta, '30000'],
    ] as const) {
      await uc.registerContribution.execute(period.id, { userId: user!.id, amount, paidAt: now }, admin);
    }

    await uc.registerPurchase.execute(
      {
        periodId: period.id,
        buyerId: luis!.id,
        store: 'Éxito',
        purchasedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        items: [
          { productId: gaseosa.id, quantity: 12, unitPrice: '2500' },
          { productId: agua.id, quantity: 6, unitPrice: '2200' },
          { productId: yogur.id, quantity: 8, unitPrice: '3000' },
          { productId: papas.id, quantity: 10, unitPrice: '2800' },
        ],
      },
      admin,
    );
    await uc.registerPurchase.execute(
      {
        periodId: period.id,
        buyerId: ana!.id,
        store: 'D1',
        purchasedAt: now,
        items: [
          { productId: gaseosa.id, quantity: 6, unitPrice: '2650' },
          { productId: manzanas.id, quantity: 12, unitPrice: '900' },
        ],
      },
      admin,
    );

    const actor = (u: { id: string }): Actor => ({ id: u.id, role: Role.EMPLOYEE });
    const out = (u: { id: string }, productId: string, quantity: number, note?: string) =>
      uc.registerStockOut.execute({ productId, quantity, note }, actor(u));
    await out(ana!, gaseosa.id, 3, 'Para el almuerzo');
    await out(luis!, papas.id, 2);
    await out(ana!, yogur.id, 2);
    await out(marta!, manzanas.id, 3);
    await out(ana!, agua.id, 4);
    await out(luis!, gaseosa.id, 2);
    await uc.registerStockOut.execute({ productId: yogur.id, quantity: 3, performedBy: luis!.id }, admin);

    console.log(
      '✔ Datos de demo creados: 3 personas (PIN en prisma/seed-demo.ts), 5 productos, 1 quincena con aportes, 2 compras y retiros.',
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('✖ Error en el seed de demo:', error);
  process.exit(1);
});
