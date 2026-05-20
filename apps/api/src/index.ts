import { buildServer } from './server.js';
import { env } from './env.js';

const server = buildServer();

const start = async (): Promise<void> => {
  try {
    await server.listen({ host: '0.0.0.0', port: env.PORT });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

void start();
