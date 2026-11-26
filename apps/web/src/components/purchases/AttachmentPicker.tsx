// Elegir fotos o PDF de la factura: con la cámara del celular o desde un archivo.
// La vista previa usa data: (la política de seguridad del sistema no deja blob:).
import { useEffect, useId, useState, type ChangeEvent } from 'react';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  attachmentProblem,
  formatFileSize,
} from '../../lib/purchases/attachments';
import { Button } from '../Button';

export interface PickedFile {
  key: string;
  file: File;
}

interface AttachmentPickerProps {
  files: PickedFile[];
  /** Cuántos archivos ya tiene la compra (al agregar a una compra existente). */
  alreadyUploaded?: number;
  disabled?: boolean;
  onChange: (files: PickedFile[]) => void;
}

let counter = 0;

export function AttachmentPicker({
  files,
  alreadyUploaded = 0,
  disabled = false,
  onChange,
}: AttachmentPickerProps) {
  const cameraId = useId();
  const fileId = useId();
  const [problems, setProblems] = useState<string[]>([]);
  const room = MAX_ATTACHMENTS - alreadyUploaded - files.length;

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ''; // permite volver a elegir el mismo archivo
    const accepted: PickedFile[] = [];
    const found: string[] = [];
    for (const file of picked) {
      const problem = attachmentProblem(file);
      if (problem) found.push(problem);
      else if (accepted.length >= room) {
        found.push(
          `Se pueden adjuntar hasta ${MAX_ATTACHMENTS} archivos por compra. «${file.name}» quedó afuera.`,
        );
      } else {
        counter += 1;
        accepted.push({ key: `f${counter}`, file });
      }
    }
    setProblems(found);
    if (accepted.length > 0) onChange([...files, ...accepted]);
  }

  const full = room <= 0;
  return (
    <div className="attach">
      <div className="attach__buttons">
        <label
          className={`btn btn--secondary attach__btn${disabled || full ? ' is-disabled' : ''}`}
          htmlFor={cameraId}
        >
          Sacar foto
          <input
            id={cameraId}
            className="sr-only"
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            disabled={disabled || full}
            onChange={onPick}
          />
        </label>
        <label
          className={`btn btn--secondary attach__btn${disabled || full ? ' is-disabled' : ''}`}
          htmlFor={fileId}
        >
          Elegir archivo
          <input
            id={fileId}
            className="sr-only"
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            disabled={disabled || full}
            onChange={onPick}
          />
        </label>
      </div>
      <p className="field__hint">
        Fotos JPG o PNG y archivos PDF, hasta 10 MB cada uno. Máximo {MAX_ATTACHMENTS} por compra.
        {full ? ' Ya llegaste al máximo.' : ''}
      </p>
      {problems.length > 0 && (
        <div className="error-message" role="alert">
          <p className="error-message__title">Hay archivos que no se pudieron agregar</p>
          <ul className="attach__problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {files.length > 0 && (
        <ul className="attach__list" aria-label="Archivos para adjuntar">
          {files.map((item) => (
            <li key={item.key} className="attach__item">
              <Preview file={item.file} />
              <div className="attach__info">
                <span className="attach__name">{item.file.name}</span>
                <span className="attach__meta">{formatFileSize(item.file.size)}</span>
              </div>
              <Button
                variant="secondary"
                disabled={disabled}
                aria-label={`Sacar ${item.file.name}`}
                onClick={() => onChange(files.filter((f) => f.key !== item.key))}
              >
                Sacar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Preview({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled && typeof reader.result === 'string') setSrc(reader.result);
    };
    reader.readAsDataURL(file);
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (file.type === 'application/pdf') {
    return (
      <span className="attach__thumb attach__thumb--pdf" aria-hidden="true">
        PDF
      </span>
    );
  }
  return src ? (
    <img className="attach__thumb" src={src} alt="" />
  ) : (
    <span className="attach__thumb" aria-hidden="true" />
  );
}
