// Arranque de la API: levanta la puerta local y, si está habilitada, la remota.
import type { Server } from 'node:http';
import { createApp, type CreateAppOptions } from './app';
import type { Channel } from './channel';
import { ConfigError, loadConfig, loadRootEnvFile } from './config';
import { disconnectPrisma, getPrisma } from './db/prisma';
import { createLogger } from './logger';
import { LoginLimiter } from './modules/auth/login-limiter';
import { closeBcryptWorker, startBcryptWorker } from './modules/auth/password';
import { warnStaleCashSessions } from './modules/cash/cash.service';

function listen(
  channel: Channel,
  bind: string,
  port: number,
  shared: Omit<CreateAppOptions, 'channel'>,
): Promise<Server> {
  const { logger } = shared;
  const app = createApp({ channel, ...shared });
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
  const prisma = getPrisma();
  // bcrypt corre en su propio hilo (ADR 004): se crea al arrancar y se cierra al apagar.
  startBcryptWorker();
  // Un solo contador de intentos para las dos puertas (las claves incluyen la puerta).
  const shared = { logger, config, prisma, loginLimiter: new LoginLimiter(config.login) };

  const servers = [await listen('local', config.local.bind, config.local.port, shared)];
  // La puerta remota queda apagada hasta la etapa 9 (REMOTE_ENABLED=false).
  if (config.remote.enabled) {
    servers.push(await listen('remote', config.remote.bind, config.remote.port, shared));
  }

  // NF-18: si quedó una caja abierta de un día anterior, se avisa en el log (no se cierra sola).
  try {
    await warnStaleCashSessions(prisma, logger);
  } catch (err) {
    logger.error({ err }, 'No se pudo revisar si hay una caja vieja abierta');
  }

  const shutdown = (signal: string) => {
    logger.info(`${signal} recibido: cerrando`);
    // Si algo queda colgado, se fuerza la salida.
    setTimeout(() => process.exit(0), 5000).unref();
    // Primero se espera que terminen los pedidos en curso; recién después se cierra la base.
    const closing = servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
          s.closeIdleConnections();
        }),
    );
    void Promise.all(closing)
      .then(() => closeBcryptWorker())
      .then(() => disconnectPrisma())
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'Error al cerrar');
        process.exit(1); // el cierre falló: se avisa con código distinto de 0
      });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) console.error(err.message);
  else console.error('No se pudo iniciar la API:', err);
  process.exit(1);
});
