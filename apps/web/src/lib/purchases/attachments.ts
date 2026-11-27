// Controles de los adjuntos antes de subirlos (el servidor los repite: aquí solo se avisa antes).
// Contrato: compras.md sección 8. JPG, PNG o PDF, hasta 10 MB cada uno (el máximo real sale de la configuración), hasta 10 por compra.
export const MAX_ATTACHMENTS = 10;
/** Respaldo solo mientras carga la configuración (`uploadMaxMb` ya es obligatorio en la respuesta). */
export const MAX_ATTACHMENT_MB = 10;
export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
/** Se usa en el `accept` del campo: lo que el celular ofrece (cámara, galería o archivos). */
export const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,application/pdf';

export function isAllowedAttachmentType(type: string): boolean {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(type);
}

/** Texto de error para un archivo, o `null` si se puede subir. */
export function attachmentProblem(
  file: Pick<File, 'name' | 'size' | 'type'>,
  maxMb: number = MAX_ATTACHMENT_MB,
): string | null {
  if (file.size === 0) return `«${file.name}» está vacío. Sacá la foto de nuevo.`;
  if (!isAllowedAttachmentType(file.type)) {
    const heic = /hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
    return heic
      ? `«${file.name}» está en un formato que no se puede subir. Mandá la foto como JPG.`
      : `«${file.name}» no se puede subir: solo se aceptan fotos JPG o PNG y archivos PDF.`;
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `«${file.name}» pesa más de ${maxMb} MB. Sacá la foto de nuevo con menos calidad.`;
  }
  return null;
}

/** "2,4 MB" o "350 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
