// Lector de `multipart/form-data` para la subida de adjuntos (ADR 005, punto 3). Usa `busboy`
// (la base de multer, sin su capa de almacenamiento): una sola parte llamada `file`, leída EN
// MEMORIA con tope de UPLOAD_MAX_MB; si el archivo lo supera, se corta la lectura en ese momento.
// Se llama DESPUÉS de sesión, rol y existencia de la compra.
import type { Request } from 'express';
import busboy from 'busboy';
import { ERROR_CODES } from '@kiosco/shared';
import { AppError } from '../../errors';
import { fieldsError } from '../../lib/owner-fields';

export interface UploadedFile {
  bytes: Buffer;
  /** Nombre que mandó el navegador. Solo se usa para mostrar, ya limpio. */
  originalName: string;
}

/** Lo que se tolera de "envoltorio" del multipart (límites y encabezado) además del archivo. */
const MULTIPART_OVERHEAD = 64 * 1024;

const tooLarge = (maxMb: number) =>
  new AppError(400, ERROR_CODES.ATTACHMENT_TOO_LARGE, `El archivo pesa más de ${maxMb} MB.`, {
    maxMb,
  });

const badForm = (message: string) =>
  fieldsError(400, ERROR_CODES.VALIDATION_ERROR, 'Mandá un solo archivo en el campo "file".', [
    { path: 'file', message },
  ]);

export function readSingleFile(
  req: Request,
  limits: { maxBytes: number; maxMb: number },
): Promise<UploadedFile> {
  // Atajo: si el pedido ya declara un tamaño imposible, ni se empieza a leer.
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limits.maxBytes + MULTIPART_OVERHEAD) {
    return Promise.reject(tooLarge(limits.maxMb));
  }

  return new Promise<UploadedFile>((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: req.headers,
        limits: { fileSize: limits.maxBytes, files: 1, fields: 0, parts: 5, headerPairs: 20 },
        // El nombre llega tal cual (con carpetas): se limpia después, solo para mostrar.
        preservePath: true,
        defParamCharset: 'utf8',
      });
    } catch {
      reject(badForm('El pedido no es un formulario de archivos válido.'));
      return;
    }

    let settled = false;
    let file: UploadedFile | null = null;

    const finish = (err: AppError | null) => {
      if (settled) return;
      settled = true;
      // Se deja de leer el resto del cuerpo y se cierra la conexión después de responder.
      req.unpipe(parser);
      req.resume();
      if (err) {
        req.res?.setHeader('Connection', 'close');
        reject(err);
        return;
      }
      if (file) resolve(file);
      else reject(badForm('Falta el archivo.'));
    };

    parser.on('file', (fieldName, stream, info) => {
      if (fieldName !== 'file') {
        stream.resume();
        finish(badForm('El archivo tiene que ir en el campo "file".'));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => finish(tooLarge(limits.maxMb)));
      stream.on('error', () => finish(badForm('No se pudo leer el archivo.')));
      stream.on('end', () => {
        if (settled) return;
        file = { bytes: Buffer.concat(chunks), originalName: info.filename ?? '' };
      });
    });
    // Campos de texto y partes de más: no se aceptan.
    parser.on('field', () => finish(badForm('Mandá solo el archivo.')));
    parser.on('fieldsLimit', () => finish(badForm('Mandá solo el archivo.')));
    parser.on('filesLimit', () => finish(badForm('Mandá un solo archivo.')));
    parser.on('partsLimit', () => finish(badForm('Mandá un solo archivo.')));
    parser.on('error', () => finish(badForm('El pedido no es un formulario de archivos válido.')));
    parser.on('close', () => finish(null));
    req.on('error', () => finish(badForm('Se cortó la conexión.')));
    req.pipe(parser);
  });
}
