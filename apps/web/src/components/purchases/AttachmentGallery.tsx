// Adjuntos de una compra ya guardada: ver (imagen o PDF), agregar más y borrar con confirmación (H-54).
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { friendlyMessage } from '../../lib/apiMessages';
import { purchaseKeys, purchasesApi } from '../../lib/purchases/api';
import { MAX_ATTACHMENTS, formatFileSize } from '../../lib/purchases/attachments';
import type { PurchaseAttachment } from '../../lib/purchases/types';
import { formatDateTime } from '../../lib/format';
import { Button } from '../Button';
import { ConfirmDialog } from '../ConfirmDialog';
import { AttachmentPicker, type PickedFile } from './AttachmentPicker';

interface AttachmentGalleryProps {
  purchaseId: number;
  attachments: PurchaseAttachment[];
}

export function AttachmentGallery({ purchaseId, attachments }: AttachmentGalleryProps) {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<PurchaseAttachment | null>(null);
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const remove = useMutation({
    mutationFn: (attachmentId: number) => purchasesApi.deleteAttachment(purchaseId, attachmentId),
    onSuccess: async () => {
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
    },
  });

  const upload = useMutation({
    mutationFn: async (items: PickedFile[]) => {
      const failed: PickedFile[] = [];
      const errors: string[] = [];
      for (const item of items) {
        try {
          await purchasesApi.upload(purchaseId, item.file);
        } catch (error) {
          failed.push(item);
          errors.push(`«${item.file.name}»: ${friendlyMessage(error)}`);
        }
      }
      return { failed, errors };
    },
    onSuccess: async ({ failed, errors }) => {
      setPicked(failed);
      setUploadErrors(errors);
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
    },
  });

  return (
    <section className="panel panel--wide" aria-labelledby="attachments-title">
      <h2 id="attachments-title">Fotos de la factura</h2>
      {attachments.length === 0 && (
        <div className="empty">
          <p className="empty__title">Todavía no hay fotos ni PDF.</p>
          <p>Sacale una foto a la factura o al remito para tener el respaldo.</p>
        </div>
      )}
      {attachments.length > 0 && (
        <ul className="attach__list attach__list--grid" aria-label="Archivos adjuntos">
          {attachments.map((a) => (
            <li key={a.id} className="attach__item attach__item--card">
              {a.mimeType === 'application/pdf' ? (
                // Los PDF no se abren en el navegador (seguridad): se descargan.
                <span
                  className="attach__thumb attach__thumb--pdf attach__thumb--big"
                  aria-hidden="true"
                >
                  PDF
                </span>
              ) : (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attach__open"
                  aria-label={`Abrir ${a.originalFileName}`}
                >
                  <img className="attach__thumb attach__thumb--big" src={a.url} alt="" />
                </a>
              )}
              <div className="attach__info">
                <span className="attach__name">{a.originalFileName}</span>
                <span className="attach__meta">
                  {formatFileSize(a.sizeBytes)} · {a.uploadedBy.fullName} ·{' '}
                  {formatDateTime(a.createdAt)}
                </span>
              </div>
              {a.mimeType === 'application/pdf' && (
                <a
                  className="btn btn--secondary"
                  href={`${a.url}?download=true`}
                  download={a.originalFileName}
                  aria-label={`Descargar ${a.originalFileName}`}
                >
                  Descargar
                </a>
              )}
              <Button
                variant="secondary"
                aria-label={`Borrar ${a.originalFileName}`}
                onClick={() => {
                  remove.reset();
                  setToDelete(a);
                }}
              >
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <h3>Agregar</h3>
      <AttachmentPicker
        files={picked}
        alreadyUploaded={attachments.length}
        disabled={upload.isPending}
        onChange={(files) => {
          setUploadErrors([]);
          setPicked(files);
        }}
      />
      {uploadErrors.length > 0 && (
        <div className="error-message" role="alert">
          <p className="error-message__title">No se pudieron subir algunos archivos</p>
          <ul className="attach__problems">
            {uploadErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {picked.length > 0 && (
        <div className="form__actions">
          <Button loading={upload.isPending} onClick={() => upload.mutate(picked)}>
            Subir {picked.length === 1 ? 'el archivo' : `los ${picked.length} archivos`}
          </Button>
        </div>
      )}
      {attachments.length >= MAX_ATTACHMENTS && (
        <p className="field__hint">Esta compra ya tiene el máximo de {MAX_ATTACHMENTS} archivos.</p>
      )}

      {toDelete && (
        <ConfirmDialog
          title="¿Borrar este archivo?"
          confirmLabel="Sí, borrar"
          danger
          busy={remove.isPending}
          error={remove.error}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove.mutate(toDelete.id)}
        >
          <p>
            Se borra «{toDelete.originalFileName}» de esta compra y no se puede recuperar. La
            compra, el stock y la deuda no cambian.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
