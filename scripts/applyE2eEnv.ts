import { e2eEnv } from './e2eEnv';

// Se importa ANTES que main.ts (los imports se evalúan en orden) para que la API lea este entorno.
Object.assign(process.env, e2eEnv());
