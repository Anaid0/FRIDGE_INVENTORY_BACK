import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../infraestructure/config/env';

const validEnv = {
  DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
  JWT_SECRET: 'un-secreto-suficientemente-largo',
  ADMIN_EMAIL: 'admin@fridgeya.local',
  ADMIN_PASSWORD: 'ClaveSegura123',
};

describe('loadEnv', () => {
  it('aplica valores por defecto a las variables opcionales', () => {
    const env = loadEnv(validEnv);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CURRENCY).toBe('COP');
  });

  it('convierte PORT a número', () => {
    expect(loadEnv({ ...validEnv, PORT: '4000' }).PORT).toBe(4000);
  });

  it('falla con un mensaje claro si falta configuración obligatoria', () => {
    expect(() => loadEnv({ ...validEnv, JWT_SECRET: 'corto', ADMIN_EMAIL: 'no-es-email' })).toThrow(
      /JWT_SECRET[\s\S]*ADMIN_EMAIL/,
    );
  });

  it('rechaza una DATABASE_URL que no sea MySQL', () => {
    expect(() => loadEnv({ ...validEnv, DATABASE_URL: 'postgres://x' })).toThrow(/DATABASE_URL/);
  });
});
