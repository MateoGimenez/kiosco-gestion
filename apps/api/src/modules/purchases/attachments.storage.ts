// Archivos adjuntos en disco (ADR 005): tipo real por los primeros bytes, nombre aleatorio,
// escritura a prueba de cortes (temporal + rename) y rutas que nunca salen de UPLOADS_DIR.
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import type { Logger } from 'pino';
import type { AttachmentMimeType } from '@kiosco/shared';
import type { PrismaClient } from '../../generated/client';

/** Nombre guardado en disco: 32 hexadecimales + extensión del tipo detectado (CHECK de la base). */
export const STORED_NAME_PATTERN = /^[0-9a-f]{32}\.(jpg|png|pdf)$/;
const TMP_SUFFIX = '.tmp';
/** Los temporales de más de una hora se consideran restos de un corte. */
const STALE_TMP_MS = 60 * 60 * 1000;

export interface DetectedType {
  mimeType: AttachmentMimeType;
  extension: 'jpg' | 'png' | 'pdf';
}

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);

/**
 * Tipo REAL del archivo por sus primeros bytes ("magic bytes"). No se le cree a la extensión ni al
 * `Content-Type` que manda el navegador. JPG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, PDF `%PDF-`.
 */
export function detectAttachmentType(bytes: Uint8Array): DetectedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mimeType: 'image/png', extension: 'png' };
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { mimeType: 'application/pdf', extension: 'pdf' };
  return null;
}

/**
 * Nombre original para MOSTRAR (nunca para armar una ruta): sin carpetas (lo que va después de la
 * última `/` o `\`), sin caracteres de control, recortado a 120; si queda vacío, `adjunto.<ext>`.
 */
export function cleanOriginalFileName(raw: string, extension: string): string {
  const lastPart = raw.split(/[\\/]/).pop() ?? '';
  // Se sacan los caracteres de control (Cc) y de formato (Cf), incluidos los bidi U+202A-202E y
  // U+2066-2069: con ellos un nombre se ve distinto de como se descarga.
  const cleaned = lastPart.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  const cut = Array.from(cleaned).slice(0, 120).join('').trim();
  return cut === '' ? `adjunto.${extension}` : cut;
}

/**
 * Nombre con el que se DESCARGA: el original sin su extensión y con la del tipo detectado, así un
 * `x.html` o un `.exe` nunca se baja con esa extensión.
 */
export function downloadFileName(originalFileName: string, extension: string): string {
  const base = originalFileName
    .replace(/\.[^.]*$/, '')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();
  return `${base === '' ? 'adjunto' : base}.${extension}`;
}

/** Crea la carpeta si no existe y prueba que se puede escribir. Si no, lanza (la API no arranca). */
export async function prepareUploadsDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const probe = join(dir, `.probe-${randomBytes(8).toString('hex')}${TMP_SUFFIX}`);
  try {
    await writeFile(probe, 'ok', { flag: 'wx' });
  } finally {
    await unlink(probe).catch(() => undefined);
  }
}

/**
 * Guarda el archivo: nombre aleatorio + extensión del tipo detectado; primero `<nombre>.tmp`
 * (abierto con `wx`), forzado a disco y renombrado al nombre final. Devuelve el nombre final.
 */
export async function storeAttachmentFile(
  dir: string,
  bytes: Buffer,
  extension: DetectedType['extension'],
): Promise<string> {
  const storedFileName = `${randomBytes(16).toString('hex')}.${extension}`;
  const finalPath = join(dir, storedFileName);
  const tmpPath = `${finalPath}${TMP_SUFFIX}`;
  const handle = await open(
    tmpPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (err) {
    await handle.close().catch(() => undefined);
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
  await handle.close();
  try {
    await rename(tmpPath, finalPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
  return storedFileName;
}

/**
 * Ruta de un archivo guardado, armada SOLO con el `storedFileName` leído de la base: se comprueba
 * el formato y que la ruta resuelta quede dentro de `dir`. Si algo no cuadra, lanza.
 */
export function resolveStoredPath(dir: string, storedFileName: string): string {
  if (!STORED_NAME_PATTERN.test(storedFileName)) {
    throw new Error('Nombre de archivo guardado inválido.');
  }
  const root = resolve(dir);
  const full = resolve(root, storedFileName);
  const rel = relative(root, full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || basename(full) !== storedFileName) {
    throw new Error('La ruta del adjunto sale de UPLOADS_DIR.');
  }
  return full;
}

/** Borra el archivo; si no existe, no es un error. Devuelve false si falló por otra causa. */
export async function removeStoredFile(
  dir: string,
  storedFileName: string,
  logger: Logger,
): Promise<boolean> {
  try {
    await unlink(resolveStoredPath(dir, storedFileName));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true;
    logger.error({ err, storedFileName }, 'No se pudo borrar un adjunto del disco');
    return false;
  }
}

/** Tamaño en bytes de un archivo guardado, o null si no está en disco. */
export async function storedFileSize(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}

export interface UploadsCleanupResult {
  staleTmpRemoved: number;
  deletedRowsRemoved: number;
  orphanFiles: string[];
}

/**
 * Al arrancar (ADR 005, punto 5): borra los `.tmp` de más de una hora, borra los archivos de filas
 * marcadas como borradas (H-54 b) y AVISA en el log de los archivos sin fila (esos no se borran solos:
 * apuntar UPLOADS_DIR a otra carpeta no debe terminar borrando archivos).
 */
export async function cleanupUploads(
  prisma: PrismaClient,
  dir: string,
  logger: Logger,
  now = Date.now(),
): Promise<UploadsCleanupResult> {
  const result: UploadsCleanupResult = {
    staleTmpRemoved: 0,
    deletedRowsRemoved: 0,
    orphanFiles: [],
  };
  const entries = await readdir(dir);

  for (const name of entries) {
    if (!name.endsWith(TMP_SUFFIX)) continue;
    const full = join(dir, name);
    const info = await stat(full).catch(() => null);
    if (info?.isFile() && now - info.mtimeMs > STALE_TMP_MS) {
      await unlink(full).catch(() => undefined);
      result.staleTmpRemoved += 1;
    }
  }

  const rows = await prisma.purchaseAttachment.findMany({
    select: { storedFileName: true, deletedAt: true },
  });
  const known = new Set(rows.map((r) => r.storedFileName));
  const present = new Set(entries);
  for (const row of rows) {
    if (row.deletedAt && present.has(row.storedFileName)) {
      if (await removeStoredFile(dir, row.storedFileName, logger)) result.deletedRowsRemoved += 1;
    }
  }
  result.orphanFiles = entries.filter((n) => STORED_NAME_PATTERN.test(n) && !known.has(n));
  if (result.orphanFiles.length > 0) {
    logger.warn(
      { count: result.orphanFiles.length, files: result.orphanFiles.slice(0, 20) },
      'Hay archivos en UPLOADS_DIR que no pertenecen a ningún adjunto. No se borran solos: revisalos a mano.',
    );
  }
  return result;
}
