import type { Express } from 'express';
import pino from 'pino';
import { createApp } from '../src/app';
import type { Channel } from '../src/channel';

/** App para tests: logger en silencio y sin tocar el .env real. */
export function buildTestApp(channel: Channel = 'local'): Express {
  return createApp({ channel, logger: pino({ level: 'silent' }) });
}
