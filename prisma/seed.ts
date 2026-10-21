import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { AdminCode, Email, User, ValidationError } from '../domain';
import { loadEnv } from '../infraestructure/config/env';
import { createPrismaClient, type PrismaClient } from '../infraestructure/persistence/prisma/prismaClient';

const BCRYPT_ROUNDS = 10;
const DEFAULT_CATEGORIES = ['Bebidas', 'Lácteos', 'Snacks', 'Frutas', 'Comidas preparadas', 'Otros'];

/**
 * Seed idempotente: se puede correr varias veces sin duplicar datos.
 * - Crea el admin inicial desde ADMIN_* si no existe (si ya existe no toca su contraseña).
 * - Si hay ADMIN_CODE (válido) y el admin aún no tiene código para la tablet, se lo pone.
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

    if (env.ADMIN_CODE) await seedAdminCode(prisma, email.value, env.ADMIN_CODE);

    const { count } = await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({ id: randomUUID(), name, createdAt: now })),
      skipDuplicates: true,
    });
    console.log(`✔ Categorías base: ${count} nuevas, ${DEFAULT_CATEGORIES.length - count} ya existían`);
  } finally {
    await prisma.$disconnect();
  }
}

/** Pone ADMIN_CODE al admin inicial si es válido, si aún no tiene código y si no lo usa otro admin. */
async function seedAdminCode(prisma: PrismaClient, email: string, raw: string): Promise<void> {
  let code: AdminCode;
  try {
    code = AdminCode.create(raw);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    console.warn(`⚠ ADMIN_CODE no se usa: ${error.message}`);
    return;
  }
  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) return;
  if (admin.adminCodeHash) {
    console.log('✔ El admin ya tiene código para la tablet (no se modifica)');
    return;
  }
  const others = await prisma.user.findMany({
    where: { role: 'ADMIN', adminCodeHash: { not: null }, id: { not: admin.id } },
    select: { adminCodeHash: true },
  });
  for (const other of others) {
    if (await bcrypt.compare(code.value, other.adminCodeHash as string)) {
      console.warn('⚠ ADMIN_CODE no se usa: ese código ya lo usa otro administrador');
      return;
    }
  }
  await prisma.user.update({
    where: { id: admin.id },
    data: { adminCodeHash: await bcrypt.hash(code.value, BCRYPT_ROUNDS) },
  });
  console.log('✔ Código para la tablet puesto al admin (ADMIN_CODE)');
}

main().catch((error: unknown) => {
  console.error('✖ Error en el seed:', error);
  process.exit(1);
});
