import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cleanOriginalFileName,
  cleanupUploads,
  detectAttachmentType,
  downloadFileName,
  prepareUploadsDir,
  resolveStoredPath,
  storeAttachmentFile,
} from '../src/modules/purchases/attachments.storage';

const dir = mkdtempSync(join(tmpdir(), 'kiosco-storage-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('detectAttachmentType', () => {
  it('reconoce JPG, PNG y PDF por los primeros bytes', () => {
    expect(detectAttachmentType(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))?.extension).toBe('jpg');
    expect(
      detectAttachmentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mimeType,
    ).toBe('image/png');
    expect(detectAttachmentType(Buffer.from('%PDF-1.7'))?.mimeType).toBe('application/pdf');
  });
  it('rechaza texto, HTML, GIF, ZIP, PNG truncado y vacío', () => {
    for (const bytes of [
      Buffer.from('hola'),
      Buffer.from('<html>'),
      Buffer.from('GIF89a'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.alloc(0),
    ])
      expect(detectAttachmentType(bytes)).toBeNull();
  });
});

describe('nombres y rutas', () => {
  it('el nombre original se limpia: sin carpetas ni caracteres de control, hasta 120', () => {
    expect(cleanOriginalFileName('C:\\fotos\\..\\a.jpg', 'jpg')).toBe('a.jpg');
    expect(cleanOriginalFileName('/etc/passwd', 'jpg')).toBe('passwd');
    expect(cleanOriginalFileName('a\u0000b\n.jpg', 'jpg')).toBe('ab.jpg');
    expect(cleanOriginalFileName('x/', 'pdf')).toBe('adjunto.pdf');
    expect(cleanOriginalFileName('a'.repeat(300), 'jpg')).toHaveLength(120);
    // Caracteres bidi (Cf): "fac\u202Egpj.exe" se vería como "facexe.jpg".
    expect(cleanOriginalFileName('fac\u202Egpj.exe\u2066', 'jpg')).toBe('facgpj.exe');
    expect(cleanOriginalFileName('\u202E\u200B', 'pdf')).toBe('adjunto.pdf');
  });

  it('el nombre de descarga lleva la extensión del tipo detectado', () => {
    expect(downloadFileName('x.html', 'pdf')).toBe('x.pdf');
    expect(downloadFileName('facgpj.exe', 'jpg')).toBe('facgpj.jpg');
    expect(downloadFileName('sin-extension', 'png')).toBe('sin-extension.png');
    expect(downloadFileName('.jpg', 'jpg')).toBe('adjunto.jpg');
  });

  it('resolveStoredPath solo acepta el formato de nombre aleatorio', () => {
    expect(resolveStoredPath(dir, `${'a'.repeat(32)}.jpg`)).toBe(
      join(dir, `${'a'.repeat(32)}.jpg`),
    );
    for (const bad of [
      '../x.jpg',
      `${'a'.repeat(32)}.exe`,
      'abc.jpg',
      `/${'a'.repeat(32)}.jpg`,
      `${'A'.repeat(32)}.jpg`,
    ])
      expect(() => resolveStoredPath(dir, bad), bad).toThrow();
  });
});

describe('escritura y limpieza al arrancar', () => {
  const logger = pino({ level: 'silent' });
  it('guarda con nombre aleatorio y no deja .tmp', async () => {
    await prepareUploadsDir(dir);
    const name = await storeAttachmentFile(dir, Buffer.from('%PDF-1.4'), 'pdf');
    expect(name).toMatch(/^[0-9a-f]{32}\.pdf$/);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('borra .tmp viejos, no los recientes, y avisa de archivos sin fila sin borrarlos', async () => {
    const old = join(dir, 'viejo.tmp');
    const fresh = join(dir, 'nuevo.tmp');
    writeFileSync(old, 'x');
    writeFileSync(fresh, 'x');
    const past = new Date(Date.now() - 2 * 3600_000);
    utimesSync(old, past, past);
    const orphan = `${'b'.repeat(32)}.jpg`;
    writeFileSync(join(dir, orphan), 'x');
    const prisma = { purchaseAttachment: { findMany: () => Promise.resolve([]) } } as never;
    const result = await cleanupUploads(prisma, dir, logger);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(result.orphanFiles).toContain(orphan);
    expect(existsSync(join(dir, orphan))).toBe(true);
  });

  it('borra los archivos de filas con deletedAt', async () => {
    const name = `${'c'.repeat(32)}.png`;
    writeFileSync(join(dir, name), 'x');
    const prisma = {
      purchaseAttachment: {
        findMany: () => Promise.resolve([{ storedFileName: name, deletedAt: new Date() }]),
      },
    } as never;
    const result = await cleanupUploads(prisma, dir, logger);
    expect(result.deletedRowsRemoved).toBe(1);
    expect(existsSync(join(dir, name))).toBe(false);
  });

  it('una carpeta donde no se puede escribir hace fallar prepareUploadsDir', async () => {
    const file = join(dir, 'es-un-archivo');
    writeFileSync(file, 'x');
    await expect(prepareUploadsDir(join(file, 'sub'))).rejects.toThrow();
  });
});
