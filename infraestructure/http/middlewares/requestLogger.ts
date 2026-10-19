import type { RequestHandler } from 'express';
import type { Logger } from '../../logging/logger';

export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level](
        { method: req.method, url: req.originalUrl, status: res.statusCode, ms: Math.round(ms) },
        'request',
      );
    });
    next();
  };
}
