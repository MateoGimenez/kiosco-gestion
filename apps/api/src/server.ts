// Arranque de la API: levanta la puerta local y, si está habilitada, la remota.
import type { Server } from 'node:http';
import type { Logger } from 'pino';
import { createApp } from './app';
import type { Channel } from './channel';
import { ConfigError, loadConfig, loadRootEnvFile } from './config';
import { createLogger } from './logger';

function listen(channel: Channel, bind: string, port: number, logger: Logger): Promise<Server> {
  const app = createApp({ channel, logger });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, bind, () => {
      logger.info(`Puerta ${channel} escuchando en ${bind}:${port}`);
      resolve(server);
    });
    server.once('error', reject);
  });
}

async function main(): Promise<void> {
  loadRootEnvFile();
  const config = loadConfig(process.env);
  const logger = createLogger(config);

  const servers = [await listen('local', config.local.bind, config.local.port, logger)];
  // La puerta remota queda apagada hasta la etapa 9 (REMOTE_ENABLED=false).
  if (config.remote.enabled) {
    servers.push(await listen('remote', config.remote.bind, config.remote.port, logger));
  }

  const shutdown = (signal: string) => {
    logger.info(`${signal} recibido: cerrando`);
    servers.forEach((s) => s.close());
    // Si algo queda colgado, se fuerza la salida.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) console.error(err.message);
  else console.error('No se pudo iniciar la API:', err);
  process.exit(1);
});
