// Ayuda opcional para contar por billetes: suma y propone el total. No manda nada al servidor.
import { useState } from 'react';
import { Decimal } from '@kiosco/shared';
import { Button } from '../Button';
import { formatCash } from '../../lib/cash/labels';
import { parseDecimal, toInputText } from '../../lib/catalog/decimalInput';

const BILLS = [20000, 10000, 2000, 1000, 500, 200, 100] as const;

interface BillCounterProps {
  /** Pasa el total al campo de "efectivo contado". */
  onUse: (total: string) => void;
}

export function BillCounter({ onUse }: BillCounterProps) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [other, setOther] = useState('');

  const total = BILLS.reduce((sum, bill) => {
    const n = Number(counts[bill] ?? '');
    return Number.isInteger(n) && n > 0 ? sum.plus(new Decimal(bill).times(n)) : sum;
  }, new Decimal(0)).plus(parseDecimal(other)?.gt(0) ? (parseDecimal(other) ?? 0) : 0);

  return (
    <details className="bills">
      <summary>Contar por billetes (ayuda)</summary>
      <div className="bills__grid">
        {BILLS.map((bill) => (
          <label key={bill} className="bills__row">
            <span>{formatCash(String(bill))}</span>
            <input
              className="field__input"
              inputMode="numeric"
              autoComplete="off"
              aria-label={`Cantidad de billetes de ${formatCash(String(bill))}`}
              placeholder="0"
              value={counts[bill] ?? ''}
              onChange={(e) =>
                setCounts((c) => ({ ...c, [bill]: e.target.value.replace(/\D/g, '') }))
              }
            />
          </label>
        ))}
        <label className="bills__row">
          <span>Monedas y otros</span>
          <input
            className="field__input"
            inputMode="decimal"
            autoComplete="off"
            aria-label="Monedas y otros, en pesos"
            placeholder="$ 0"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          />
        </label>
      </div>
      <div className="bills__total">
        <span>
          Suma: <strong>{formatCash(total)}</strong>
        </span>
        <Button
          variant="secondary"
          disabled={total.isZero()}
          onClick={() => onUse(toInputText(total.toFixed()))}
        >
          Usar este total
        </Button>
      </div>
    </details>
  );
}
