import { Link } from 'react-router';
import { Button } from './Button';

interface AdjustStockActionProps {
  to: string;
  label: string;
  /** Desde afuera del local no se ajusta stock: el botón queda apagado. */
  remote: boolean;
  /** Id de la nota "Solo desde el local" que explica por qué está apagado. */
  noteId?: string;
  primary?: boolean;
  ariaLabel?: string;
}

/** "Ajustar stock": enlace desde el local; botón apagado (con motivo) desde afuera. */
export function AdjustStockAction({
  to,
  label,
  remote,
  noteId,
  primary = false,
  ariaLabel,
}: AdjustStockActionProps) {
  const variant = primary ? 'btn--primary' : 'btn--secondary';
  if (remote) {
    return (
      <Button
        variant={primary ? 'primary' : 'secondary'}
        disabled
        aria-describedby={noteId}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      >
        {label}
      </Button>
    );
  }
  return (
    <Link to={to} className={`btn ${variant}`} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}>
      {label}
    </Link>
  );
}
