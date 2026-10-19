import pino, { type Logger } from 'pino';
import type { Env } from '../config/env';

export type { Logger };

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    redact: [
      'req.headers.authorization',
      'password',
      '*.password',
      '*.passwordHash',
      'pin',
      '*.pin',
      '*.pinHash',
    ],
    ...(env.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
    }),
  });
}
