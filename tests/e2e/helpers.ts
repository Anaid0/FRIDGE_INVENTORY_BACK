import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createContainer, type Container } from '../../infraestructure/config/container';
import { loadEnv } from '../../infraestructure/config/env';
import { createApp } from '../../infraestructure/http/server';
import { createPrismaClient, type PrismaClient } from '../../infraestructure/persistence/prisma/prismaClient';
import { E2E_ADMIN_CODE } from '../../scripts/e2eEnv';

/** Admin de los e2e. `code`: su código para entrar a la administración desde la tablet. */
export const ADMIN = { email: 'admin@e2e.test', password: 'AdminE2e123', code: E2E_ADMIN_CODE };

/**
 * App real (Express + Prisma + MySQL) contra la base de tests. Antes de cada archivo vacía las tablas.
 * Se niega a correr si DATABASE_URL_TEST no apunta a una base "_test" (para no borrar desarrollo).
 */
export async function createE2EContext() {
  const databaseUrl = process.env.DATABASE_URL_TEST ?? '';
  if (!/_test(\?|$)/.test(new URL(databaseUrl).pathname)) {
    throw new Error(`DATABASE_URL_TEST debe apuntar a una base *_test (actual: ${databaseUrl})`);
  }
  const uploadsDir = await mkdtemp(path.join(tmpdir(), 'fridgeya-e2e-'));
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    BCRYPT_ROUNDS: '4',
    UPLOADS_DIR: uploadsDir,
  });
  const prisma: PrismaClient = createPrismaClient(databaseUrl);
  const container: Container = createContainer(env);
  const app = createApp(container);

  /** Vacía las tablas en el orden de las FK (sin desactivar FOREIGN_KEY_CHECKS, que es por conexión). */
  async function reset() {
    usedPins.clear();
    await prisma.periodRankingEntry.deleteMany();
    await prisma.periodRanking.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.purchaseItem.deleteMany();
    await prisma.purchase.deleteMany();
    await prisma.contribution.deleteMany();
    await prisma.consumptionCharge.deleteMany();
    await prisma.fundingPeriod.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.kioskDevice.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        name: 'Admin',
        lastname: 'E2E',
        email: ADMIN.email,
        passwordHash: await bcrypt.hash(ADMIN.password, 4),
        adminCodeHash: await bcrypt.hash(ADMIN.code, 4),
        role: 'ADMIN',
      },
    });
  }

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    return res.body.token as string;
  }

  /** PIN válidos y distintos (dos personas no pueden tener el mismo PIN) para las que no indican uno. */
  const SPARE_PINS = ['2580', '3691', '4826', '5937', '6148', '7259', '8361', '9472', '1738', '2847'];
  const usedPins = new Set<string>();

  /** Registra una persona (nombre + PIN) como admin y devuelve su id. Las personas no inician sesión. */
  async function createPerson(adminToken: string, name: string, explicitPin?: string) {
    const pin = explicitPin ?? SPARE_PINS.find((candidate) => !usedPins.has(candidate));
    if (!pin) throw new Error('No quedan PIN de prueba libres');
    usedPins.add(pin);
    const res = await request(app)
      .post('/api/people')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, lastname: 'E2E', pin })
      .expect(201);
    return { id: res.body.id as string };
  }

  async function close() {
    await container.close();
    await prisma.$disconnect();
    await rm(uploadsDir, { recursive: true, force: true });
  }

  return { app, prisma, uploadsDir, reset, login, createPerson, close };
}

export type E2EContext = Awaited<ReturnType<typeof createE2EContext>>;

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
