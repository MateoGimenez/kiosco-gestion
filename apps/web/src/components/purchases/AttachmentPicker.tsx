// Elegir fotos o PDF de la factura: con la cámara del celular o desde un archivo.
// La vista previa usa data: (la política de seguridad del sistema no deja blob:).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState, type ChangeEvent } from 'react';
import { catalogApi, keys } from '../../lib/catalog/api';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_MB,
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
  // Límite de tamaño desde la configuración; si no llega, vale el respaldo de 10 MB.
  const settings = useQuery({
    queryKey: keys.settings,
    queryFn: ({ signal }) => catalogApi.settings(signal),
  });
  const maxMb = settings.data?.uploadMaxMb ?? MAX_ATTACHMENT_MB;
  const room = MAX_ATTACHMENTS - alreadyUploaded - files.length;

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ''; // permite volver a elegir el mismo archivo
    const accepted: PickedFile[] = [];
    const found: string[] = [];
    for (const file of picked) {
      const problem = attachmentProblem(file, maxMb);
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
        Fotos JPG o PNG y archivos PDF, hasta {maxMb} MB cada uno. Máximo {MAX_ATTACHMENTS} por
        compra.
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
                <SuspiciousNote file={item.file} />
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

/** ¿Los primeros bytes son de un JPG, PNG o PDF? (solo para avisar; el servidor decide). */
async function looksLikeAllowedFile(file: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  return (
    starts([0xff, 0xd8, 0xff]) ||
    starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    starts([0x25, 0x50, 0x44, 0x46, 0x2d])
  );
}

function Preview({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
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
  if (file.type === 'application/pdf' || broken) {
    return (
      <span className="attach__thumb attach__thumb--pdf" aria-hidden="true">
        {broken ? 'Archivo' : 'PDF'}
      </span>
    );
  }
  return src ? (
    <img className="attach__thumb" src={src} alt="" onError={() => setBroken(true)} />
  ) : (
    <span className="attach__thumb" aria-hidden="true" />
  );
}

function SuspiciousNote({ file }: { file: File }) {
  const [suspicious, setSuspicious] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void looksLikeAllowedFile(file).then((ok) => {
      if (!cancelled) setSuspicious(!ok);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (!suspicious) return null;
  return (
    <span className="attach__warn">
      No parece una foto ni un PDF. Si no se puede subir, el sistema te lo va a avisar.
    </span>
  );
}
