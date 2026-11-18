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

describe('loadConfig: validación fail-closed de redes y sesión (ADR 003, punto 3)', () => {
  const bad = (env: Record<string, string>, pattern: RegExp) =>
    expect(() => loadConfig({ ...valid, ...env })).toThrow(pattern);

  it('por defecto solo permite la propia PC', () => {
    const { network } = loadConfig(valid);
    expect(network.localCidrs).toEqual(['127.0.0.1/32', '::1/128']);
    expect(network.localAllowedHosts).toEqual(['localhost', '127.0.0.1', '::1']);
    expect(network.remoteHost).toBeNull();
  });

  it('LOCAL_CIDRS: vacía, mal formada, todo internet o superpuesta con Tailscale', () => {
    bad({ LOCAL_CIDRS: '' }, /LOCAL_CIDRS/);
    bad({ LOCAL_CIDRS: '192.168.1.0' }, /LOCAL_CIDRS/); // sin prefijo
    bad({ LOCAL_CIDRS: 'hola/24' }, /LOCAL_CIDRS/);
    bad({ LOCAL_CIDRS: '0.0.0.0/0' }, /todo internet/);
    bad({ LOCAL_CIDRS: '127.0.0.1/32,::/0' }, /todo internet/);
    bad({ LOCAL_CIDRS: '100.64.0.0/10' }, /Tailscale/);
    bad({ LOCAL_CIDRS: '100.100.0.0/16' }, /Tailscale/);
    bad({ LOCAL_CIDRS: '100.0.0.0/8' }, /Tailscale/); // lo contiene
    bad({ LOCAL_CIDRS: 'fd7a:115c:a1e0::/48' }, /Tailscale/);
  });

  it('LOCAL_CIDRS acepta una subred normal', () => {
    expect(
      loadConfig({ ...valid, LOCAL_CIDRS: '127.0.0.1/32,192.168.1.0/24' }).network.localCidrs,
    ).toHaveLength(2);
  });

  it('LOCAL_ALLOWED_HOSTS: vacía o con esquema, puerto o barra', () => {
    bad({ LOCAL_ALLOWED_HOSTS: '' }, /LOCAL_ALLOWED_HOSTS/);
    bad({ LOCAL_ALLOWED_HOSTS: 'http://localhost' }, /LOCAL_ALLOWED_HOSTS/);
    bad({ LOCAL_ALLOWED_HOSTS: 'localhost:3000' }, /LOCAL_ALLOWED_HOSTS/);
    bad({ LOCAL_ALLOWED_HOSTS: 'localhost/' }, /LOCAL_ALLOWED_HOSTS/);
  });

  it('REMOTE_HOST: obligatorio con REMOTE_ENABLED, nombre válido, no IP, no repetido en los locales', () => {
    bad({ REMOTE_ENABLED: 'true' }, /REMOTE_HOST/);
    bad({ REMOTE_ENABLED: 'true', REMOTE_HOST: '100.64.0.1' }, /REMOTE_HOST/);
    bad({ REMOTE_ENABLED: 'true', REMOTE_HOST: 'https://k.ts.net' }, /REMOTE_HOST/);
    bad({ REMOTE_ENABLED: 'true', REMOTE_HOST: 'k.ts.net:443' }, /REMOTE_HOST/);
    bad({ REMOTE_ENABLED: 'true', REMOTE_HOST: 'localhost' }, /REMOTE_HOST/);
    expect(
      loadConfig({ ...valid, REMOTE_ENABLED: 'true', REMOTE_HOST: 'K.ts.net' }).network.remoteHost,
    ).toBe('k.ts.net');
  });

  it('REMOTE_BIND solo loopback y REMOTE_PORT distinto de LOCAL_PORT', () => {
    bad({ REMOTE_BIND: 'localhost' }, /REMOTE_BIND/);
    bad({ REMOTE_PORT: '3000' }, /REMOTE_PORT/);
    bad({ LOCAL_PORT: '3001' }, /REMOTE_PORT/);
  });

  it('SESSION_HOURS y REMOTE_SESSION_HOURS de 1 a 12, la remota no mayor que la local', () => {
    bad({ SESSION_HOURS: '13' }, /SESSION_HOURS/);
    bad({ SESSION_HOURS: '0' }, /SESSION_HOURS/);
    bad({ REMOTE_SESSION_HOURS: '13' }, /REMOTE_SESSION_HOURS/);
    bad({ SESSION_HOURS: '2', REMOTE_SESSION_HOURS: '3' }, /REMOTE_SESSION_HOURS/);
    const cfg = loadConfig(valid);
    expect([cfg.sessionHours, cfg.remoteSessionHours]).toEqual([12, 4]);
  });

  it('BCRYPT_COST de 10 a 14; solo con NODE_ENV=test se acepta desde 4', () => {
    bad({ BCRYPT_COST: '9' }, /BCRYPT_COST/);
    bad({ BCRYPT_COST: '15' }, /BCRYPT_COST/);
    expect(loadConfig({ ...valid, BCRYPT_COST: '4', NODE_ENV: 'test' }).bcryptCost).toBe(4);
    bad({ BCRYPT_COST: '4', NODE_ENV: 'production' }, /BCRYPT_COST/);
    expect(loadConfig(valid).bcryptCost).toBe(12);
  });

  it('LOGIN_*: fuera de rango', () => {
    bad({ LOGIN_MAX_ATTEMPTS: '2' }, /LOGIN_MAX_ATTEMPTS/);
    bad({ LOGIN_MAX_ATTEMPTS: '11' }, /LOGIN_MAX_ATTEMPTS/);
    bad({ LOGIN_WINDOW_MINUTES: '61' }, /LOGIN_WINDOW_MINUTES/);
    bad({ LOGIN_LOCK_MINUTES: '0' }, /LOGIN_LOCK_MINUTES/);
    expect(loadConfig(valid).login).toEqual({ maxAttempts: 5, windowMinutes: 15, lockMinutes: 15 });
  });
});
