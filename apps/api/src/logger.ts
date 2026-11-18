import pino, { type Logger } from 'pino';
import type { AppConfig } from './config';

/** Logger de la API. En desarrollo sale legible (pino-pretty); en producción, JSON. */
export function createLogger(config: Pick<AppConfig, 'logLevel' | 'nodeEnv'>): Logger {
  return pino({
    level: config.logLevel,
    // Nunca se registran cookies ni contraseñas.
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
      ],
      censor: '[oculto]',
    },
    ...(config.nodeEnv === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  });
}
