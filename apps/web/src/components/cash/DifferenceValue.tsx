// La diferencia del arqueo: verde si es 0, ámbar si sobra, rojo si falta. Siempre con texto.
import { Decimal } from '@kiosco/shared';
import { differenceTone, formatCash } from '../../lib/cash/labels';

interface DifferenceValueProps {
  value: string;
  /** Versión corta para listas: "−$ 100" en vez de "Faltan $ 100". */
  compact?: boolean;
}

export function DifferenceValue({ value, compact = false }: DifferenceValueProps) {
  const d = new Decimal(value);
  const tone = differenceTone(value);
  const text = d.isZero()
    ? 'Sin diferencia'
    : d.isNegative()
      ? compact
        ? `${formatCash(d)} (falta)`
        : `Faltan ${formatCash(d.abs())}`
      : compact
        ? `+${formatCash(d)} (sobra)`
        : `Sobran ${formatCash(d)}`;
  return <span className={`diff diff--${tone}`}>{text}</span>;
}
