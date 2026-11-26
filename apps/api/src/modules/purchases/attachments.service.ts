// Adjuntos de compras (docs/api/compras.md 8; ADR 005): subir, ver y borrar.
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import {
  ERROR_CODES,
  MAX_ATTACHMENTS_PER_PURCHASE,
  PurchaseAttachmentSchema,
  type PurchaseAttachment,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import { attachmentUrl } from './purchases.mapper';
import {
  cleanOriginalFileName,
  downloadFileName,
  detectAttachmentType,
  removeStoredFile,
  resolveStoredPath,
  storeAttachmentFile,
  storedFileSize,
} from './attachments.storage';
import { readSingleFile } from './multipart';

const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, 'El adjunto no existe.');

/** La compra tiene que existir (se mira ANTES de leer el cuerpo: nadie sin permiso hace subir 10 MB). */
export async function assertPurchaseExists(ctx: AppContext, purchaseId: number): Promise<void> {
  const found = await ctx.prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true },
  });
  if (!found) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La compra no existe.');
}

export async function uploadAttachment(
  ctx: AppContext,
  req: Request,
  purchaseId: number,
): Promise<PurchaseAttachment> {
  const user = req.user!;
  const audit = auditContext(req);
  const { dir, maxBytes, maxMb } = ctx.config.uploads;
  await assertPurchaseExists(ctx, purchaseId);

  const file = await readSingleFile(req, { maxBytes, maxMb });
  const type = file.bytes.length > 0 ? detectAttachmentType(file.bytes) : null;
  if (!type) {
    throw new AppError(
      400,
      ERROR_CODES.ATTACHMENT_TYPE_NOT_ALLOWED,
      'Solo se pueden adjuntar fotos JPG o PNG, o archivos PDF.',
      { allowed: ['JPG', 'PNG', 'PDF'] },
    );
  }

  // Primero el archivo (temporal + rename), después la fila; si la transacción falla, se borra el archivo.
  const storedFileName = await storeAttachmentFile(dir, file.bytes, type.extension);
  try {
    const row = await ctx.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM purchases WHERE id = ${purchaseId} FOR UPDATE`;
      if (!locked[0]) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La compra no existe.');
      const count = await tx.purchaseAttachment.count({ where: { purchaseId, deletedAt: null } });
      if (count >= MAX_ATTACHMENTS_PER_PURCHASE) {
        throw new AppError(
          422,
          ERROR_CODES.ATTACHMENT_LIMIT_REACHED,
          `Esta compra ya tiene ${MAX_ATTACHMENTS_PER_PURCHASE} adjuntos.`,
        );
      }
      const created = await tx.purchaseAttachment.create({
        data: {
          purchaseId,
          originalFileName: cleanOriginalFileName(file.originalName, type.extension),
          storedFileName,
          mimeType: type.mimeType,
          sizeBytes: file.bytes.length,
          uploadedById: user.id,
        },
        include: { uploadedBy: { select: { id: true, fullName: true } } },
      });
      await writeAudit(tx, {
        userId: user.id,
        action: 'PURCHASE_ATTACHMENT_ADD',
        entityType: 'Purchase',
        entityId: purchaseId,
        details: {
          attachmentId: created.id,
          originalFileName: created.originalFileName,
          mimeType: created.mimeType,
          sizeBytes: created.sizeBytes,
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return created;
    });
    return parseResponse(PurchaseAttachmentSchema, {
      id: row.id,
      purchaseId: row.purchaseId,
      originalFileName: row.originalFileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt.toISOString(),
      url: attachmentUrl(row.purchaseId, row.id),
    });
  } catch (err) {
    await removeStoredFile(dir, storedFileName, ctx.logger);
    throw err;
  }
}

/** Sirve el archivo (stream) con los encabezados del contrato 8.2. */
export async function serveAttachment(
  ctx: AppContext,
  res: Response,
  purchaseId: number,
  attachmentId: number,
  download: boolean,
): Promise<void> {
  const row = await ctx.prisma.purchaseAttachment.findFirst({
    where: { id: attachmentId, purchaseId, deletedAt: null },
  });
  if (!row) throw notFound();
  let path: string;
  try {
    path = resolveStoredPath(ctx.config.uploads.dir, row.storedFileName);
  } catch (err) {
    ctx.logger.error({ err, attachmentId }, 'Nombre de adjunto inválido en la base');
    throw notFound();
  }
  const size = await storedFileSize(path);
  if (size === null) {
    ctx.logger.error({ attachmentId }, 'El adjunto no está en el disco');
    throw notFound();
  }
  const isPdf = row.mimeType === 'application/pdf';
  const extension = row.storedFileName.split('.').pop()!;
  res.status(200);
  res.set({
    'Content-Type': row.mimeType,
    'Content-Length': String(size),
    'X-Content-Type-Options': 'nosniff',
    // El PDF siempre se descarga (puede traer JavaScript); las imágenes se muestran en la página.
    'Content-Disposition': `${download || isPdf ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeRFC5987(downloadFileName(row.originalFileName, extension))}`,
    'Cache-Control': 'no-store',
    // `sandbox` en las imágenes; el PDF se baja, así que no lo necesita.
    'Content-Security-Policy': isPdf
      ? "default-src 'none'"
      : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  });
  await pipeline(createReadStream(path), res);
}

function encodeRFC5987(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function deleteAttachment(
  ctx: AppContext,
  req: Request,
  purchaseId: number,
  attachmentId: number,
): Promise<void> {
  const user = req.user!;
  const audit = auditContext(req);
  const stored = await ctx.prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM purchases WHERE id = ${purchaseId} FOR UPDATE`;
    if (!locked[0]) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La compra no existe.');
    const row = await tx.purchaseAttachment.findFirst({
      where: { id: attachmentId, purchaseId, deletedAt: null },
    });
    if (!row) throw notFound();
    await tx.purchaseAttachment.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: 'PURCHASE_ATTACHMENT_DELETE',
      entityType: 'Purchase',
      entityId: purchaseId,
      details: {
        attachmentId: row.id,
        originalFileName: row.originalFileName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        uploadedById: row.uploadedById,
        uploadedAt: row.createdAt.toISOString(),
      },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    return row.storedFileName;
  });
  // Recién después de confirmar: si falla, lo completa el arranque (ADR 005 punto 5).
  await removeStoredFile(ctx.config.uploads.dir, stored, ctx.logger);
}
