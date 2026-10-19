import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Email, User } from '../domain';
import { loadEnv } from '../infraestructure/config/env';
import { createPrismaClient } from '../infraestructure/persistence/prisma/prismaClient';

const BCRYPT_ROUNDS = 10;
const DEFAULT_CATEGORIES = ['Bebidas', 'Lácteos', 'Snacks', 'Frutas', 'Comidas preparadas', 'Otros'];

/**
 * Seed idempotente: se puede correr varias veces sin duplicar datos.
 * - Crea el admin inicial desde ADMIN_* si no existe (si ya existe no toca su contraseña).
 * - Crea las categorías base que falten.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = createPrismaClient(env.DATABASE_URL);
  const now = new Date();

  try {
    const email = Email.create(env.ADMIN_EMAIL);
    const existing = await prisma.user.findUnique({ where: { email: email.value } });

    if (existing) {
      console.log(`✔ Admin ya existe: ${existing.email} (no se modifica)`);
    } else {
      const admin = User.createAdmin({
        id: randomUUID(),
        name: env.ADMIN_NAME,
        lastname: env.ADMIN_LASTNAME,
        email,
        passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_ROUNDS),
        now,
      });
      await prisma.user.create({
        data: {
          id: admin.id,
          name: admin.name,
          lastname: admin.lastname,
          email: admin.email?.value ?? null,
          passwordHash: admin.passwordHash,
          role: admin.role,
          isActive: admin.isActive,
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt,
        },
      });
      console.log(`✔ Admin creado: ${env.ADMIN_EMAIL}`);
    }

    const { count } = await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({ id: randomUUID(), name, createdAt: now })),
      skipDuplicates: true,
    });
    console.log(`✔ Categorías base: ${count} nuevas, ${DEFAULT_CATEGORIES.length - count} ya existían`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('✖ Error en el seed:', error);
  process.exit(1);
});
