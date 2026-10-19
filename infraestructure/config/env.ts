import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Separados por coma. Incluye el WebView de la app Android (http://localhost con Capacitor). */
  CORS_ORIGIN: z
    .string()
    .min(1)
    .default('http://localhost:5173,http://localhost,https://localhost,capacitor://localhost'),

  DATABASE_URL: z.string().startsWith('mysql://', 'DATABASE_URL debe ser una URL de MySQL'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]?$/, 'JWT_EXPIRES_IN debe ser como 8h, 30m o 3600')
    .default('8h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  ADMIN_NAME: z.string().min(1).default('Admin'),
  ADMIN_LASTNAME: z.string().min(1).default('FridgeYA'),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD debe tener al menos 8 caracteres'),

  CURRENCY: z.string().length(3).default('COP'),
  /** Zona horaria de la oficina: define cuándo empieza y termina cada día de una quincena. */
  APP_TIMEZONE: z
    .string()
    .default('America/Bogota')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'APP_TIMEZONE debe ser una zona horaria IANA, por ejemplo America/Bogota'),
  UPLOADS_DIR: z.string().min(1).default('./uploads'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  return result.data;
}
