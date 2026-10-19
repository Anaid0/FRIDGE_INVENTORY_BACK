import { createContainer } from './infraestructure/config/container';
import { loadEnv } from './infraestructure/config/env';
import { createApp } from './infraestructure/http/server';

function bootstrap(): void {
  const env = loadEnv();
  const container = createContainer(env);
  const app = createApp(container);
  const { logger } = container;

  const server = app.listen(env.PORT, () => {
    logger.info(`FridgeYA API escuchando en http://localhost:${env.PORT}/api (env=${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} recibido, cerrando...`);
    server.close(async () => {
      await container.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap();
