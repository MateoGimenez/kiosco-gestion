// Registrar una devolución del proveedor (docs/api/proveedores.md 15.9, H-65 a H-71): la plata vuelve al kiosco.
// Cuatro orígenes; el efectivo que entra a la caja solo desde el local y siempre con fecha de hoy.
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Decimal,
  ERROR_CODES,
  checkSupplierRefund,
  formatMoneyWithCents,
  newClientRequestId,
} from '@kiosco/shared';
import { ApiError } from '../../lib/api';
import { friendlyMessage } from '../../lib/apiMessages';
import { cashKeys } from '../../lib/cash/api';
import { toApiNumber, toInputText } from '../../lib/catalog/decimalInput';
import { checkMoney } from '../../lib/catalog/validation';
import { purchaseKeys, supplierKeys, suppliersApi } from '../../lib/purchases/api';
import { todayDate } from '../../lib/purchases/helpers';
import { balanceSign, refundSourceOptions } from '../../lib/purchases/labels';
import type { PaymentSource } from '../../lib/purchases/types';
import { ConfirmDialog } from '../ConfirmDialog';
import { FormDialog } from '../FormDialog';
import { SelectField } from '../SelectField';
import { TextField } from '../TextField';

interface RefundDialogProps {
  supplierId: number;
  supplierName: string;
  /** Saldo actual con signo: negativo = saldo a favor del kiosco. */
  balance: string;
  remote: boolean;
  /** Descripción precargada (por ejemplo, la que viene de una compra anulada). */
  initialDescription?: string;
  onClose: () => void;
  onRefunded: (message: string) => void;
}

interface FieldErrors {
  amount?: string;
  source?: string;
  date?: string;
}

/** Cuánto queda en la cuenta, dicho con palabras: a favor, en cero o con deuda. */
function afterCaption(balanceAfter: string): string {
  const sign = balanceSign(balanceAfter);
  if (sign < 0) return 'Saldo a favor después';
  if (sign > 0) return 'Le vas a deber';
  return 'Después';
}

function afterValue(balanceAfter: string): string {
  return balanceSign(balanceAfter) === 0
    ? 'Sin saldo'
    : formatMoneyWithCents(new Decimal(balanceAfter).abs());
}

function refundErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === ERROR_CODES.CASH_SESSION_REQUIRED) {
    return 'No hay ninguna caja abierta. Abrí la caja o elegí otro origen.';
  }
  return friendlyMessage(error);
}

export function RefundDialog({
  supplierId,
  supplierName,
  balance,
  remote,
  initialDescription = '',
  onClose,
  onRefunded,
}: RefundDialogProps) {
  const queryClient = useQueryClient();
  // Un solo id por formulario: si el pedido se repite (doble clic, WiFi cortado, confirmación), no se registra dos veces.
  const requestId = useRef(newClientRequestId());
  const credit = balanceSign(balance) < 0 ? new Decimal(balance).abs() : null;
  const [amount, setAmount] = useState(credit ? toInputText(credit.toFixed()) : '');
  const [source, setSource] = useState<PaymentSource | ''>('');
  const [date, setDate] = useState(todayDate());
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState(initialDescription);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [exceeds, setExceeds] = useState<{ balanceAfter: string } | null>(null);

  const parsed = checkMoney(amount, 'El monto');
  const validAmount = parsed.value && parsed.value.gt(0) ? parsed.value : null;
  const check = validAmount ? checkSupplierRefund({ balance, amount: validAmount }) : null;
  // La fecha solo se elige cuando la plata no entra a la caja (con la caja es siempre hoy).
  const askDate = source !== '' && source !== 'CASH_REGISTER';

  const refund = useMutation({
    mutationFn: (confirmExceedsCredit: boolean) =>
      suppliersApi.refund(supplierId, {
        clientRequestId: requestId.current,
        amount: toApiNumber(validAmount ?? new Decimal(0)),
        source: source as PaymentSource,
        ...(askDate && date !== todayDate() ? { entryDate: date } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(confirmExceedsCredit ? { confirmExceedsCredit: true } : {}),
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      await queryClient.invalidateQueries({ queryKey: cashKeys.all });
      if (response.isReplay) {
        onRefunded('Esa devolución ya estaba registrada. No se cargó de nuevo.');
        return;
      }
      const balanceText = `Saldo con ${supplierName}: ${formatMoneyWithCents(response.balance)}.`;
      onRefunded(
        response.cashMovement
          ? `Devolución registrada. ${balanceText} Entraron ${formatMoneyWithCents(response.cashMovement.amount)} a la caja abierta.`
          : `Devolución registrada. ${balanceText}`,
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === ERROR_CODES.REFUND_EXCEEDS_CREDIT) {
        const d = error.details ?? {};
        setExceeds({
          balanceAfter: String(d.balanceAfter ?? check?.balanceAfter ?? '0'),
        });
        return;
      }
      setExceeds(null);
    },
  });

  function submit() {
    const next: FieldErrors = {};
    if (amount.trim() === '') next.amount = 'Escribí cuánto te devolvieron.';
    else if (parsed.error) next.amount = parsed.error;
    else if (!validAmount) next.amount = 'El monto tiene que ser mayor que cero.';
    if (source === '') next.source = 'Elegí cómo te devolvió la plata.';
    if (askDate && (date === '' || date > todayDate())) {
      next.date = 'Elegí una fecha de hoy o anterior.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    refund.mutate(false);
  }

  if (exceeds) {
    const after = new Decimal(exceeds.balanceAfter);
    return (
      <ConfirmDialog
        title="La devolución es mayor que el saldo a favor"
        confirmLabel="Registrar igual"
        cancelLabel="Revisar el monto"
        busy={refund.isPending}
        error={
          refund.error &&
          !(
            refund.error instanceof ApiError &&
            refund.error.code === ERROR_CODES.REFUND_EXCEEDS_CREDIT
          )
            ? refundErrorMessage(refund.error)
            : undefined
        }
        onCancel={() => setExceeds(null)}
        onConfirm={() => refund.mutate(true)}
      >
        <p>
          {credit
            ? `${supplierName} te debe devolver como máximo ${formatMoneyWithCents(credit)} y estás registrando ${formatMoneyWithCents(validAmount ?? new Decimal(0))}.`
            : `Hoy no hay saldo a favor del kiosco con ${supplierName} y estás registrando ${formatMoneyWithCents(validAmount ?? new Decimal(0))}.`}
        </p>
        <p>
          {after.gt(0) ? (
            <>
              Si seguís, el kiosco le va a deber <strong>{formatMoneyWithCents(after)}</strong> al
              proveedor.
            </>
          ) : (
            <>
              Si seguís, el saldo queda en <strong>{formatMoneyWithCents(after.abs())}</strong> a
              favor del kiosco.
            </>
          )}
        </p>
      </ConfirmDialog>
    );
  }

  return (
    <FormDialog
      title={`Registrar una devolución de ${supplierName}`}
      submitLabel="Registrar devolución"
      busy={refund.isPending}
      error={refund.error ? refundErrorMessage(refund.error) : undefined}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label="Monto devuelto"
        hint={
          credit
            ? `Saldo a favor del kiosco: ${formatMoneyWithCents(credit)}. Podés devolver una parte.`
            : 'Por ahora no hay saldo a favor del kiosco con este proveedor.'
        }
        inputMode="decimal"
        autoComplete="off"
        value={amount}
        error={errors.amount}
        data-autofocus
        onChange={(e) => setAmount(e.target.value)}
      />
      <SelectField
        label="¿Cómo te devolvió la plata?"
        value={source}
        placeholder="Elegí una opción"
        options={refundSourceOptions(remote)}
        error={errors.source}
        hint={
          remote
            ? 'Solo desde el local: el efectivo que entra a la caja no se puede registrar desde afuera.'
            : 'Solo el efectivo que entra a la caja suma al arqueo.'
        }
        onChange={(e) => setSource(e.target.value as PaymentSource)}
      />
      {source === 'CASH_REGISTER' && (
        <p className="field__hint">
          Con efectivo de la caja, la devolución se registra con la fecha de hoy.
        </p>
      )}
      {askDate && (
        <TextField
          label="Fecha en que te la devolvió"
          type="date"
          max={todayDate()}
          value={date}
          error={errors.date}
          onChange={(e) => setDate(e.target.value)}
        />
      )}
      <TextField
        label="Referencia (opcional)"
        hint="Por ejemplo, el número de la nota de crédito o de la transferencia."
        autoComplete="off"
        maxLength={100}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />
      <TextField
        label="Descripción (opcional)"
        autoComplete="off"
        maxLength={200}
        value={description}
        placeholder="Devuelve lo pagado de la compra #22 (anulada)"
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="refund-summary" role="status" aria-live="polite">
        {check ? (
          <>
            <dl className="refund-summary__row">
              <div>
                <dt>Saldo a favor ahora</dt>
                <dd>{credit ? formatMoneyWithCents(credit) : 'Sin saldo'}</dd>
              </div>
              <div aria-hidden="true" className="refund-summary__arrow">
                →
              </div>
              <div>
                <dt>{afterCaption(check.balanceAfter)}</dt>
                <dd>{afterValue(check.balanceAfter)}</dd>
              </div>
            </dl>
            {check.exceedsCredit && (
              <p className="refund-summary__warn">
                {credit ? 'Es más que lo que te debe: ' : 'No tiene saldo a favor: '}
                {balanceSign(check.balanceAfter) > 0
                  ? `después le vas a deber ${formatMoneyWithCents(check.balanceAfter)}.`
                  : 'revisá el monto antes de registrar.'}
              </p>
            )}
          </>
        ) : (
          <p className="refund-summary__empty">Escribí el monto para ver cómo queda la cuenta.</p>
        )}
      </div>
    </FormDialog>
  );
}
