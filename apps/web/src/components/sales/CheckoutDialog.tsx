// Cobro: uno o varios pagos, recargo del crédito, vuelto y envío con un identificador que no cambia
// entre reintentos (docs/api/ventas.md 2.2 a 2.5).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Decimal, formatMoney } from '@kiosco/shared';
import { Button } from '../Button';
import { ErrorMessage } from '../ErrorMessage';
import { ApiError } from '../../lib/api';
import { friendlyMessage } from '../../lib/apiMessages';
import { exceedsDecimals, parseDecimal, toApiNumber } from '../../lib/catalog/decimalInput';
import { salesApi } from '../../lib/sales/api';
import { computeCart, toSaleLines, type CartDiscount, type CartLine } from '../../lib/sales/cart';
import type {
  CreateSaleRequest,
  CreateSaleResponse,
  PaymentMethod,
  TotalChangedDetails,
} from '../../lib/sales/types';

interface PayRow {
  id: number;
  methodId: number;
  amount: string;
}

interface CheckoutDialogProps {
  lines: readonly CartLine[];
  discount: CartDiscount | null;
  /** Solo los medios activos, en su orden. */
  methods: readonly PaymentMethod[];
  /** El identificador de este carrito: no cambia mientras no se cobre. */
  getClientRequestId: () => string;
  onClose: () => void;
  onSold: (response: CreateSaleResponse) => void;
  /** Cambió un precio o el recargo (H-33). La pantalla actualiza el carrito y devuelve cuando terminó. */
  onTotalChanged: (details: TotalChangedDetails) => Promise<void>;
  /** Un producto se desactivó o ya no existe (H-34). */
  onUnavailable: (productIds: number[]) => void;
  /** Esa venta ya estaba cobrada (el identificador ya se usó con otro contenido). */
  onAlreadySold: () => void;
  onCashSessionMissing: () => void;
}

function wholePesos(text: string): Decimal | null {
  const value = parseDecimal(text);
  if (value === null || !value.gt(0) || exceedsDecimals(value, 0)) return null;
  return value;
}

function isConnectionProblem(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

export function CheckoutDialog({
  lines,
  discount,
  methods,
  getClientRequestId,
  onClose,
  onSold,
  onTotalChanged,
  onUnavailable,
  onAlreadySold,
  onCashSessionMissing,
}: CheckoutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tenderedRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(2);
  // Candado síncrono: el estado de React llega tarde y un doble Enter alcanzaría a mandar dos pedidos.
  const lock = useRef(false);
  // Fila a la que hay que llevar el foco después del próximo dibujo (por ejemplo, la recién agregada).
  const focusRow = useRef<number | null>(null);
  const submitRef = useRef<(event?: FormEvent) => Promise<void>>(async () => {});

  const cash = methods.find((m) => m.kind === 'CASH') ?? methods[0];
  const discountInput = discount ? { type: discount.type, value: discount.value } : null;
  const base = computeCart(lines, discountInput);
  const amountDue = base.calc.amountDue;

  const [rows, setRows] = useState<PayRow[]>(() =>
    cash ? [{ id: 1, methodId: cash.id, amount: toApiNumber(amountDue) }] : [],
  );
  const [tendered, setTendered] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<{ connection: boolean } | null>(null);
  const [changed, setChanged] = useState<{
    from: string;
    to: string;
    adjusted: string | null;
  } | null>(null);
  const [alreadySold, setAlreadySold] = useState<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (tenderedRef.current ?? dialog.querySelector<HTMLElement>('.checkout__quick button'))?.focus();
  }, []);

  // El foco no se pierde nunca: si el elemento activo salió del diálogo o quedó deshabilitado
  // (por ejemplo, el botón "Resto con" que ya no hace falta), se lo lleva a un lugar útil.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    const lost =
      !active ||
      !dialog.contains(active) ||
      (active instanceof HTMLButtonElement && active.disabled);
    if (focusRow.current !== null) {
      const input = dialog.querySelector<HTMLElement>(`[data-row="${focusRow.current}"] input`);
      focusRow.current = null;
      if (input) return input.focus();
    }
    if (!lost) return;
    const target =
      dialog.querySelector<HTMLElement>('.checkout__submit:not(:disabled)') ??
      dialog.querySelector<HTMLElement>('.pay-row input:not(:disabled)');
    target?.focus();
  });

  useEffect(() => {
    submitRef.current = submit;
  });

  // Ctrl+Enter cobra desde cualquier lugar del diálogo (también si el foco quedó en el fondo).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        void submitRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const methodOf = (row: PayRow) => methods.find((m) => m.id === row.methodId);
  const parsed = rows.map((row) => ({
    row,
    amount: wholePesos(row.amount),
    method: methodOf(row),
  }));
  const validPayments = parsed.flatMap((p) =>
    p.amount && p.method
      ? [{ amount: toApiNumber(p.amount), surchargePercent: p.method.surchargePercent }]
      : [],
  );
  const full = computeCart(lines, discountInput, validPayments).calc;
  // Cada fila válida, en el mismo orden que el cálculo.
  let calcIndex = 0;
  const rowCalc = parsed.map((p) =>
    p.amount && p.method ? full.payments[calcIndex++] : undefined,
  );

  const allValid = parsed.length > 0 && parsed.every((p) => p.amount !== null && p.method);
  const over = full.remaining.isNegative();
  const covered = full.remaining.isZero();
  const cashSum = parsed.reduce(
    (acc, p) => (p.method?.kind === 'CASH' && p.amount ? acc.plus(p.amount) : acc),
    new Decimal(0),
  );
  const hasCash = parsed.some((p) => p.method?.kind === 'CASH');
  const tenderedValue = tendered.trim() === '' ? null : wholePesos(tendered);
  const tenderedBad = tendered.trim() !== '' && tenderedValue === null;
  const tenderedLow = tenderedValue !== null && tenderedValue.lt(cashSum);
  const change = tenderedValue && !tenderedLow ? tenderedValue.minus(cashSum) : null;
  const canSubmit = allValid && covered && !tenderedBad && !tenderedLow && base.ok;
  const total = full.total;

  function setAmount(id: number, amount: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, amount } : r)));
  }
  function addRest(method: PaymentMethod) {
    const remaining = full.remaining;
    if (!remaining.gt(0)) return;
    const id = nextId.current++;
    focusRow.current = id;
    setRows((prev) => [...prev, { id, methodId: method.id, amount: toApiNumber(remaining) }]);
  }
  function allCash() {
    if (!cash) return;
    setRows([{ id: nextId.current++, methodId: cash.id, amount: toApiNumber(amountDue) }]);
    setTendered('');
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (lock.current || !canSubmit) return;
    lock.current = true;
    setSubmitting(true);
    setError(null);
    setPending(null);
    setAlreadySold(null);
    const body: CreateSaleRequest = {
      clientRequestId: getClientRequestId(),
      items: toSaleLines(lines),
      payments: parsed.map((p) => ({
        paymentMethodId: p.row.methodId,
        amount: toApiNumber(p.amount ?? new Decimal(0)),
      })),
      expectedTotal: toApiNumber(total),
    };
    if (discount) {
      body.discount =
        discount.reason !== ''
          ? { type: discount.type, value: discount.value, reason: discount.reason }
          : { type: discount.type, value: discount.value };
    }
    if (hasCash && tenderedValue) body.cashTendered = toApiNumber(tenderedValue);
    try {
      const response = await salesApi.create(body);
      onSold(response);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SALE_TOTAL_CHANGED' && e.details) {
        const details = e.details as unknown as TotalChangedDetails;
        await onTotalChanged(details);
        // Los pagos tienen que volver a sumar el total nuevo: se ajusta el último por la diferencia.
        const newDue = new Decimal(details.subtotal).minus(details.discountAmount);
        const paid = parsed.reduce((acc, p) => acc.plus(p.amount ?? 0), new Decimal(0));
        const last = parsed[parsed.length - 1];
        let adjusted: string | null = null;
        if (last && last.amount) {
          const next = last.amount.plus(newDue.minus(paid));
          if (next.gt(0) && !next.equals(last.amount)) {
            setAmount(last.row.id, toApiNumber(next));
            adjusted = `Se ajustó el último pago${last.method ? ` (${last.method.name})` : ''}: de ${formatMoney(last.amount)} a ${formatMoney(next)}. Revisá los montos.`;
          } else if (!next.gt(0)) {
            adjusted = 'Los pagos ya no alcanzan a cubrir el total nuevo: revisá los montos.';
          }
        }
        setChanged({ from: details.expectedTotal, to: details.total, adjusted });
      } else if (
        e instanceof ApiError &&
        (e.code === 'PRODUCT_INACTIVE' || e.code === 'PRODUCT_NOT_FOUND')
      ) {
        const items = (e.details?.items ?? []) as { index: number; productId: number }[];
        onUnavailable(items.map((i) => i.productId));
      } else if (e instanceof ApiError && e.code === 'SALE_REQUEST_ID_REUSED') {
        const saleId = Number((e.details as { saleId?: number } | undefined)?.saleId ?? 0);
        setAlreadySold(saleId || -1);
      } else if (e instanceof ApiError && e.code === 'CASH_SESSION_REQUIRED') {
        onCashSessionMissing();
      } else if (isConnectionProblem(e)) {
        setPending({ connection: true });
      } else {
        setError(e);
      }
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  const submitLabel = pending
    ? 'Reintentar cobro'
    : changed
      ? `Confirmar y cobrar ${formatMoney(total)}`
      : `Cobrar ${formatMoney(total)}`;

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--checkout"
      aria-labelledby="checkout-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onClose();
      }}
    >
      <form className="checkout" onSubmit={(e) => void submit(e)} noValidate>
        <header className="checkout__head">
          <h2 id="checkout-title">Cobrar</h2>
          <div className="checkout__total">
            <span className="checkout__total-label">Total a cobrar</span>
            <strong className="checkout__total-value" aria-live="polite">
              {formatMoney(total)}
            </strong>
          </div>
          <p className="checkout__breakdown">
            Subtotal {formatMoney(full.subtotal)}
            {!full.discountAmount.isZero() && <> · Descuento −{formatMoney(full.discountAmount)}</>}
            {!full.surchargeAmount.isZero() && (
              <> · Recargo de crédito +{formatMoney(full.surchargeAmount)}</>
            )}
          </p>
        </header>

        <div className="checkout__body">
          {changed && (
            <div className="notice notice--warning" role="alert">
              El total cambió: antes era {formatMoney(changed.from)} y ahora es{' '}
              {formatMoney(changed.to)} (se actualizó un precio o el recargo). Revisá el carrito y
              confirmá para cobrar de nuevo. {changed.adjusted}
            </div>
          )}

          <div className="checkout__quick">
            <Button variant="secondary" onClick={allCash} disabled={!cash || submitting}>
              Todo en efectivo
            </Button>
            <span className="checkout__quick-label" id="rest-label">
              Resto con:
            </span>
            <div className="checkout__rest" role="group" aria-labelledby="rest-label">
              {methods.map((m) => (
                <Button
                  key={m.id}
                  variant="secondary"
                  disabled={!full.remaining.gt(0) || submitting}
                  onClick={() => addRest(m)}
                >
                  {m.name}
                </Button>
              ))}
            </div>
          </div>

          <ul className="pay-list">
            {parsed.map((p, index) => {
              const result = rowCalc[index];
              const kind = p.method?.kind;
              const isCard = kind === 'CREDIT_CARD' || kind === 'DEBIT_CARD';
              const noExceed = (kind === 'QR' || kind === 'TRANSFER') && over;
              const amountError =
                p.row.amount.trim() === '' || p.amount === null
                  ? 'Escribí el monto en pesos enteros, sin centavos.'
                  : noExceed
                    ? 'No puede pasar del total. Si el cliente transfirió de más, se le devuelve por fuera del sistema.'
                    : null;
              return (
                <li key={p.row.id} className="pay-row" data-row={p.row.id}>
                  <select
                    className="field__input field__select pay-row__method"
                    aria-label={`Medio de pago ${index + 1}`}
                    value={p.row.methodId}
                    disabled={submitting}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === p.row.id ? { ...r, methodId: Number(e.target.value) } : r,
                        ),
                      )
                    }
                  >
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field__input pay-row__amount"
                    aria-label={`Monto del pago ${index + 1} (sin recargo)`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={p.row.amount}
                    disabled={submitting}
                    aria-invalid={amountError ? true : undefined}
                    onChange={(e) => setAmount(p.row.id, e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => setRows((prev) => prev.filter((r) => r.id !== p.row.id))}
                    disabled={rows.length === 1 || submitting}
                    aria-label={`Quitar el pago ${index + 1}`}
                  >
                    Quitar
                  </Button>
                  {isCard && result && (
                    <p className="pay-row__charge">
                      Cobrá <strong>{formatMoney(result.chargedAmount)}</strong> en el posnet
                      {!result.surchargeAmount.isZero() && (
                        <span className="pay-row__detail">
                          {' '}
                          ({formatMoney(result.amount)} + {formatMoney(result.surchargeAmount)} de
                          recargo)
                        </span>
                      )}
                    </p>
                  )}
                  {amountError && <p className="pay-row__error">{amountError}</p>}
                </li>
              );
            })}
          </ul>

          <p
            role="status"
            className={`checkout__status${covered && allValid ? ' is-ok' : over ? ' is-bad' : ''}`}
          >
            {over
              ? `Los pagos se pasan del total por ${formatMoney(full.remaining.abs())}.`
              : covered
                ? 'Los pagos cubren el total.'
                : `Falta cobrar ${formatMoney(full.remaining)}.`}
          </p>

          {hasCash && (
            <div className="checkout__cash">
              <div className="field">
                <label className="field__label" htmlFor="tendered">
                  Efectivo que entrega el cliente (opcional)
                </label>
                <input
                  ref={tenderedRef}
                  id="tendered"
                  className="field__input"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={`Para calcular el vuelto de ${formatMoney(cashSum)}`}
                  value={tendered}
                  disabled={submitting}
                  aria-invalid={tenderedBad || tenderedLow ? true : undefined}
                  onChange={(e) => setTendered(e.target.value)}
                />
                {tenderedBad && (
                  <span className="field__error">Escribí un monto en pesos enteros.</span>
                )}
                {tenderedLow && (
                  <span className="field__error">
                    No alcanza para la parte en efectivo ({formatMoney(cashSum)}).
                  </span>
                )}
              </div>
              {change && (
                <p className="checkout__change" aria-live="polite">
                  Vuelto <strong>{formatMoney(change)}</strong>
                </p>
              )}
            </div>
          )}

          {alreadySold !== null && (
            <div className="notice notice--warning" role="alert">
              {alreadySold > 0
                ? `Esa venta ya se había cobrado (venta #${alreadySold}).`
                : 'Esa venta ya se había cobrado.'}{' '}
              Revisá antes de cobrar de nuevo.
              <div className="checkout__inline-action">
                <Button variant="secondary" onClick={onAlreadySold}>
                  Dejarla como cobrada y empezar otra
                </Button>
              </div>
            </div>
          )}
          {pending && (
            <div className="notice notice--warning" role="alert">
              No se pudo confirmar el cobro por un problema de conexión: la venta puede haberse
              guardado. Tocá «Reintentar cobro»: se usa el mismo número de venta, así que no se
              cobra dos veces.
            </div>
          )}
          {error !== null && (
            <ErrorMessage title="No se pudo cobrar" message={friendlyMessage(error)} />
          )}
        </div>

        <div className="dialog__actions">
          <Button variant="secondary" large onClick={onClose} disabled={submitting}>
            Volver al carrito
          </Button>
          <Button
            type="submit"
            large
            loading={submitting}
            disabled={!canSubmit}
            className="checkout__submit"
          >
            {submitting ? 'Cobrando…' : submitLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
