import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createPrismaClient } from '../infraestructure/persistence/prisma/prismaClient';
import { e2eEnv } from './e2eEnv';

/**
 * Deja la base de tests en un estado conocido para los e2e del navegador:
 * migraciones al día, tablas vacías, admin + categorías (seed) y datos de demostración.
 */
async function main() {
  const env = e2eEnv();
  const run = (args: string[]) => execFileSync('npx', args, { stdio: 'inherit', env });

  run(['prisma', 'migrate', 'deploy']);

  const prisma = createPrismaClient(env.DATABASE_URL!);
  try {
    // Orden de las FK: no hace falta desactivar FOREIGN_KEY_CHECKS.
    await prisma.inventoryMovement.deleteMany();
    await prisma.purchaseItem.deleteMany();
    await prisma.purchase.deleteMany();
    await prisma.contribution.deleteMany();
    await prisma.fundingPeriod.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.kioskDevice.deleteMany();
    await prisma.user.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
  rmSync(env.UPLOADS_DIR!, { recursive: true, force: true });

  run(['tsx', 'prisma/seed.ts']);
  run(['tsx', 'prisma/seed-demo.ts']);
  console.log('✔ Base de e2e lista');
}

main().catch((error: unknown) => {
  console.error('✖ No se pudo preparar la base de e2e:', error);
  process.exit(1);
});
