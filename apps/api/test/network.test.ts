import { describe, expect, it } from 'vitest';
import { auditIp, hostnameOf, isLocalAddress, normalizeIp, parseCidrs } from '../src/network';

const ranges = parseCidrs(['127.0.0.1/32', '::1/128', '192.168.1.0/24', 'fe80::/10']);

describe('clasificación de IP (ADR 003, punto 10)', () => {
  it.each([
    ['::ffff:192.168.1.5', true],
    ['192.168.1.5', true],
    ['::1', true],
    ['127.0.0.1', true],
    ['::ffff:127.0.0.1', true],
    ['fe80::1%12', true], // con zona, según LOCAL_CIDRS
    ['::ffff:100.64.0.1', false], // Tailscale
    ['100.101.102.103', false],
    ['fd7a:115c:a1e0::5', false],
    ['192.168.2.5', false],
    ['8.8.8.8', false],
    ['basura', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (address, expected) => {
    expect(isLocalAddress(address, ranges)).toBe(expected);
  });

  it('fe80::1%12 queda fuera si LOCAL_CIDRS no incluye fe80::/10', () => {
    expect(isLocalAddress('fe80::1%12', parseCidrs(['192.168.1.0/24']))).toBe(false);
  });

  it('normalizeIp quita la zona y el prefijo ::ffff:', () => {
    expect(normalizeIp('::ffff:192.168.1.5')).toBe('192.168.1.5');
    expect(normalizeIp('fe80::1%12')).toBe('fe80::1');
    expect(normalizeIp('no es ip')).toBeNull();
  });
});

describe('hostnameOf', () => {
  it('quita puerto y corchetes y pasa a minúsculas', () => {
    expect(hostnameOf('Localhost:3000')).toBe('localhost');
    expect(hostnameOf('192.168.1.10:3000')).toBe('192.168.1.10');
    expect(hostnameOf('[::1]:3000')).toBe('::1');
    expect(hostnameOf('kiosco.x.ts.net')).toBe('kiosco.x.ts.net');
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf('[roto')).toBeNull();
  });
});

describe('auditIp (solo informativa)', () => {
  it('local: IP del socket normalizada, ignora X-Forwarded-For', () => {
    expect(auditIp('local', '::ffff:192.168.1.5', '1.2.3.4')).toBe('192.168.1.5');
  });
  it('remota: último valor válido de X-Forwarded-For; si no, el socket', () => {
    expect(auditIp('remote', '127.0.0.1', '9.9.9.9, 100.64.1.2')).toBe('100.64.1.2');
    expect(auditIp('remote', '127.0.0.1', 'basura')).toBe('127.0.0.1');
    expect(auditIp('remote', '127.0.0.1', undefined)).toBe('127.0.0.1');
  });
});
