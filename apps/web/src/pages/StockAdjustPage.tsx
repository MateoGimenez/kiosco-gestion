// Ajuste de stock (encargado y dueño): primero el motivo, después la cantidad.
// La persona escribe un número positivo; el sistema pone el signo según el motivo (H-29).
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatQuantity } from '@kiosco/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { useIsRemote } from '../lib/useRole';
import { TextAreaField } from '../components/TextAreaField';
import { TextField } from '../components/TextField';
import { catalogApi, keys } from '../lib/catalog/api';
import { isNegative, quantityText } from '../lib/catalog/labels';
import {
  REASONS,
  amountLabel,
  evaluateAdjustment,
  reasonInfo,
  type AdjustmentInput,
} from '../lib/catalog/stockAdjustment';
import type { StockAdjustmentReason } from '../lib/catalog/types';

const REASON_VALUES = REASONS.map((r) => r.value as string);

export function StockAdjustPage() {
  const { id } = useParams();
  const productId = Number(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isRemote = useIsRemote();

  const product = useQuery({
    queryKey: keys.product(productId),
    queryFn: ({ signal }) => catalogApi.product(productId, signal),
    enabled: Number.isInteger(productId) && productId > 0,
  });

  const presetReason = searchParams.get('reason') ?? '';
  const [reason, setReason] = useState<StockAdjustmentReason | ''>(
    REASON_VALUES.includes(presetReason) ? (presetReason as StockAdjustmentReason) : '',
  );
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'ADD' | 'SUBTRACT'>('SUBTRACT');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const p = product.data;
  const input: AdjustmentInput | null =
    p && reason
      ? { reason, amount, direction, note, saleUnit: p.saleUnit, currentStock: p.stockQuantity }
      : null;
  const result = input ? evaluateAdjustment(input) : null;

  const adjust = useMutation({
    mutationFn: () => {
      if (!result?.request) throw new Error('Falta completar el formulario.');
      return catalogApi.adjust(productId, result.request);
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: keys.products });
      await queryClient.invalidateQueries({ queryKey: keys.movements(productId) });
      await queryClient.invalidateQueries({ queryKey: keys.stockLists });
      const unit = p?.saleUnit ?? 'UNIT';
      void navigate(`/productos/${productId}`, {
        state: {
          notice: `Stock ajustado. Ahora hay ${quantityText(data.product.stockQuantity, unit)}.`,
        },
      });
    },
  });

  if (product.isPending) return <LoadingState label="Cargando el producto…" />;
  if (product.isError) {
    return (
      <div className="page">
        <ErrorMessage
          title="No se pudo cargar el producto"
          error={product.error}
          onRetry={() => void product.refetch()}
        />
      </div>
    );
  }
  const prod = product.data;

  if (prod.isMiscellaneous) {
    return (
      <div className="page">
        <Link to={`/productos/${prod.id}`} className="back-link">
          ‹ Volver a la ficha
        </Link>
        <h1>Ajustar stock</h1>
        <Notice variant="info">"Varios" no lleva stock, así que no se puede ajustar.</Notice>
      </div>
    );
  }

  const info = reason ? reasonInfo(reason) : null;
  const mode = info?.mode;
  const showErrors = submitted && result;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    adjust.reset();
    if (result && result.request && Object.keys(result.errors).length === 0) setConfirming(true);
  }

  const delta = result?.delta;
  const after = result?.after;
  const amountOk = result && !result.errors.amount && delta && after;

  return (
    <div className="page">
      <Link to={`/productos/${prod.id}`} className="back-link">
        ‹ Volver a la ficha
      </Link>
      <div>
        <h1>Ajustar stock</h1>
        <p className="page__sub">
          {prod.name} · Hay ahora{' '}
          <strong className={isNegative(prod.stockQuantity) ? 'text-bad' : undefined}>
            {quantityText(prod.stockQuantity, prod.saleUnit)}
          </strong>
        </p>
      </div>

      {isRemote && (
        <Notice variant="warning">
          Solo desde el local: desde afuera no se puede ajustar el stock.
        </Notice>
      )}

      <form className="form form--wide" onSubmit={onSubmit} noValidate>
        <fieldset className="fieldset">
          <legend>1. ¿Por qué cambia el stock?</legend>
          <div className="choices" role="radiogroup" aria-label="Motivo del ajuste">
            {REASONS.map((r) => (
              <label key={r.value} className={`choice${reason === r.value ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => {
                    setReason(r.value);
                    setSubmitted(false);
                    adjust.reset();
                  }}
                />
                <span className="choice__label">{r.label}</span>
                <span className="choice__effect">{r.effect}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {info && (
          <fieldset className="fieldset">
            <legend>2. ¿Cuánto?</legend>
            {mode === 'EITHER' && (
              <div className="segmented" role="radiogroup" aria-label="Sumar o restar">
                <label className={`segmented__item${direction === 'SUBTRACT' ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="direction"
                    checked={direction === 'SUBTRACT'}
                    onChange={() => setDirection('SUBTRACT')}
                  />
                  Restar
                </label>
                <label className={`segmented__item${direction === 'ADD' ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="direction"
                    checked={direction === 'ADD'}
                    onChange={() => setDirection('ADD')}
                  />
                  Sumar
                </label>
              </div>
            )}
            <TextField
              label={amountLabel(info.value, direction)}
              hint={
                mode === 'COUNT'
                  ? 'Escribí lo que hay en el local ahora. El sistema calcula la diferencia.'
                  : prod.saleUnit === 'KG'
                    ? 'Escribí un número sin signo. Podés usar decimales (por ejemplo, 0,350).'
                    : 'Escribí un número sin signo. Solo enteros: este producto se vende por unidad.'
              }
              inputMode="decimal"
              autoFocus
              autoComplete="off"
              value={amount}
              error={showErrors ? result.errors.amount : undefined}
              onChange={(e) => setAmount(e.target.value)}
            />

            <div className="pricebox" aria-live="polite">
              {amountOk ? (
                <>
                  <span className="pricebox__label">
                    {delta.isNegative() ? 'Resta' : 'Suma'}{' '}
                    {formatQuantity(delta.abs().toFixed(), prod.saleUnit)}
                  </span>
                  <span className="pricebox__value">
                    Va a quedar {formatQuantity(after.toFixed(), prod.saleUnit)}
                  </span>
                  <span className="pricebox__help">
                    Hay ahora {quantityText(prod.stockQuantity, prod.saleUnit)}.
                    {after.isNegative() &&
                      ' El stock va a quedar en negativo; se puede, y después lo corregís con un conteo.'}
                  </span>
                </>
              ) : (
                <span className="pricebox__help">
                  {mode === 'COUNT'
                    ? 'Escribí lo que contaste para ver la diferencia.'
                    : 'Escribí la cantidad para ver cómo queda el stock.'}
                </span>
              )}
            </div>

            <TextAreaField
              label={info.value === 'OTHER' ? 'Nota (obligatoria)' : 'Nota (opcional)'}
              hint={
                info.value === 'OTHER'
                  ? 'Contá qué pasó con el producto.'
                  : 'Si querés, dejá una aclaración para el historial.'
              }
              rows={2}
              maxLength={500}
              value={note}
              error={showErrors ? result.errors.note : undefined}
              onChange={(e) => setNote(e.target.value)}
            />
          </fieldset>
        )}

        <div className="form__actions">
          <Button type="submit" large disabled={!info || isRemote}>
            Revisar ajuste
          </Button>
          <Link to={`/productos/${prod.id}`} className="btn btn--secondary btn--large">
            Cancelar
          </Link>
        </div>
      </form>

      {confirming && result?.request && delta && after && (
        <ConfirmDialog
          title="¿Confirmás el ajuste?"
          confirmLabel="Confirmar ajuste"
          busy={adjust.isPending}
          error={adjust.isError ? adjust.error : undefined}
          onCancel={() => {
            adjust.reset();
            setConfirming(false);
          }}
          onConfirm={() => adjust.mutate()}
        >
          <p>
            <strong>{prod.name}</strong>
          </p>
          <ul className="summary">
            <li>Motivo: {info?.label}</li>
            <li>Hay ahora: {quantityText(prod.stockQuantity, prod.saleUnit)}</li>
            <li>
              {delta.isNegative() ? 'Se resta' : 'Se suma'}:{' '}
              {formatQuantity(delta.abs().toFixed(), prod.saleUnit)}
            </li>
            <li>
              <strong>Va a quedar: {formatQuantity(after.toFixed(), prod.saleUnit)}</strong>
            </li>
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}
