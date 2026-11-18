import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';

const valid = {
  DATABASE_URL: 'postgresql://kiosco:x@localhost:5432/kiosco_test?schema=public',
  JWT_SECRET: 'a'.repeat(48),
};

describe('loadConfig', () => {
  it('acepta una configuración mínima válida y usa los valores por defecto', () => {
    const cfg = loadConfig(valid);
    expect(cfg.local).toEqual({ bind: '0.0.0.0', port: 3000 });
    expect(cfg.remote.enabled).toBe(false);
  });

  it('usa PORT si no hay LOCAL_PORT', () => {
    expect(loadConfig({ ...valid, PORT: '4000' }).local.port).toBe(4000);
    expect(loadConfig({ ...valid, PORT: '4000', LOCAL_PORT: '5000' }).local.port).toBe(5000);
  });

  it('falla si falta JWT_SECRET (o está vacío)', () => {
    expect(() => loadConfig({ DATABASE_URL: valid.DATABASE_URL })).toThrow(ConfigError);
    expect(() => loadConfig({ ...valid, JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
  });

  it('falla si JWT_SECRET tiene menos de 32 bytes o es un valor de ejemplo', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'corta' })).toThrow(/32 bytes/);
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'cambiar_esta_clave_'.repeat(3) })).toThrow(
      /ejemplo/,
    );
  });

  it('no muestra el valor de la clave en el error', () => {
    try {
      loadConfig({ ...valid, JWT_SECRET: 'corta' });
    } catch (e) {
      expect((e as Error).message).not.toContain('corta');
    }
  });

  it('REMOTE_BIND tiene que ser loopback', () => {
    expect(() => loadConfig({ ...valid, REMOTE_BIND: '0.0.0.0' })).toThrow(/REMOTE_BIND/);
  });
});
