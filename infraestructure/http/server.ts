import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Container } from '../config/container';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { requestLogger } from './middlewares/requestLogger';
import { apiRouter } from './routes/apiRouter';

export function createApp(container: Container): Express {
  const app = express();
  const { env, logger } = container;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  if (env.NODE_ENV !== 'test') app.use(requestLogger(logger));

  app.use('/api', apiRouter(container));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
