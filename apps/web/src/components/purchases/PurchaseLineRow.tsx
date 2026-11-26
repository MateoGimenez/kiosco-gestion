// Una línea de la compra: producto, unidad o bulto, cantidad, costo neto e IVA.
// Se llena de izquierda a derecha con Tab; Enter en el costo vuelve al buscador para el siguiente producto.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { VAT_RATES, formatMoneyWithCents, formatPercent, formatQuantity } from '@kiosco/shared';
import type { CalcLineResult } from '../../lib/purchases/calculate';
import type { LineDraft, LineField } from '../../lib/purchases/lines';
import type { QuantityMode } from '../../lib/purchases/types';
import { Button } from '../Button';
import { SelectField } from '../SelectField';
import { TextField } from '../TextField';

interface PurchaseLineRowProps {
  line: LineDraft;
  index: number;
  errors: Partial<Record<LineField, string>>;
  /** Resultado del cálculo de esta línea, si está completa. */
  result: CalcLineResult | null;
  /** Texto de aviso propio de la línea (producto desactivado, otro proveedor habitual…). */
  warning?: string | undefined;
  inactive?: boolean;
  /** La línea recién agregada lleva el cursor a su primer campo. */
  autoFocus: boolean;
  /** Otra línea del mismo producto (para avisar). */
  duplicated: boolean;
  /** `onChange` recibe el cambio ya mezclado. */
  onChange: (next: LineDraft) => void;
  onRemove: () => void;
  /** Se terminó de cargar la línea: el cursor vuelve al buscador. */
  onDone: () => void;
}

const VAT_OPTIONS = VAT_RATES.map((v) => ({ value: v, label: formatPercent(v) }));

export function PurchaseLineRow({
  line,
  index,
  errors,
  result,
  warning,
  inactive = false,
  autoFocus,
  duplicated,
  onChange,
  onRemove,
  onDone,
}: PurchaseLineRowProps) {
  const rootRef = useRef<HTMLLIElement>(null);
  const { product } = line;
  const set = (patch: Partial<LineDraft>) => onChange({ ...line, ...patch });

  useEffect(() => {
    if (autoFocus) rootRef.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
    // Solo al aparecer la línea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCostKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      onDone();
    }
  }

  function chooseMode(mode: QuantityMode) {
    if (mode === line.mode) return;
    set({ mode });
    // Al pasar a bulto sin unidades por bulto conocidas, se pide ese dato primero.
  }

  return (
    <li ref={rootRef} className="pline" aria-label={`Línea ${index + 1}: ${product.name}`}>
      <div className="pline__head">
        <div className="pline__who">
          <span className="pline__name">{product.name}</span>
          <span className="pline__sub">
            Stock actual: {formatQuantity(product.stockQuantity, product.saleUnit)}
          </span>
        </div>
        <Button
          variant="secondary"
          aria-label={`Sacar ${product.name} de la compra`}
          onClick={onRemove}
        >
          Sacar
        </Button>
      </div>

      <div className="segmented pline__mode" role="radiogroup" aria-label="Cómo lo compraste">
        {(['UNIT', 'PACK'] as const).map((mode) => (
          <label key={mode} className={`segmented__item${line.mode === mode ? ' is-on' : ''}`}>
            <input
              type="radio"
              name={`mode-${line.key}`}
              checked={line.mode === mode}
              onChange={() => chooseMode(mode)}
            />
            {mode === 'UNIT' ? (product.saleUnit === 'KG' ? 'Por kg' : 'Por unidad') : 'Por bulto'}
          </label>
        ))}
      </div>

      <div className="pline__fields">
        {line.mode === 'UNIT' ? (
          <>
            <TextField
              label={product.saleUnit === 'KG' ? 'Kilos' : 'Cantidad'}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={line.quantity}
              error={errors.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
            />
            <TextField
              label={
                product.saleUnit === 'KG' ? 'Costo sin IVA por kg' : 'Costo sin IVA por unidad'
              }
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={line.unitNetCost}
              error={errors.unitNetCost}
              onChange={(e) => set({ unitNetCost: e.target.value })}
              onKeyDown={onCostKey}
            />
          </>
        ) : (
          <>
            <TextField
              label="Bultos"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={line.packCount}
              error={errors.packCount}
              onChange={(e) => set({ packCount: e.target.value })}
            />
            <TextField
              label={`Unidades por bulto${product.saleUnit === 'KG' ? ' (kg)' : ''}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={line.unitsPerPack}
              error={errors.unitsPerPack}
              onChange={(e) => set({ unitsPerPack: e.target.value })}
            />
            <TextField
              label="Costo sin IVA de un bulto"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={line.packNetCost}
              error={errors.packNetCost}
              onChange={(e) => set({ packNetCost: e.target.value })}
              onKeyDown={onCostKey}
            />
          </>
        )}
        <SelectField
          label="IVA de la factura"
          value={line.vat}
          options={VAT_OPTIONS}
          onChange={(e) => set({ vat: e.target.value })}
        />
      </div>

      <p className="pline__calc" aria-live="polite">
        {result ? (
          <>
            {line.mode === 'PACK' && (
              <span>
                Entran {formatQuantity(result.quantity, product.saleUnit)}{' '}
                {product.saleUnit === 'KG' ? '' : 'unidades'}
                {' · '}
                {formatMoneyWithCents(result.unitNetCost)} cada una sin IVA
                {' · '}
              </span>
            )}
            <strong>Subtotal sin IVA: {formatMoneyWithCents(result.lineNetTotal)}</strong>
          </>
        ) : (
          <span>Completá los datos para ver el subtotal.</span>
        )}
      </p>

      {duplicated && (
        <p className="pline__note">
          Este producto está en otra línea de la compra. Si es a propósito, está bien.
        </p>
      )}
      {warning && <p className="pline__note">{warning}</p>}
      {inactive && (
        <p className="pline__alert" role="alert">
          Este producto está desactivado y no se puede comprar. Reactivalo desde{' '}
          <Link to={`/productos/${product.id}`} target="_blank" rel="noopener noreferrer">
            su ficha
          </Link>{' '}
          o sacalo de la compra.
        </p>
      )}
    </li>
  );
}
