// Registrar un pago a un proveedor (PRV-04): cuatro orígenes; el efectivo de la caja solo desde el local.
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Decimal, formatMoneyWithCents, newClientRequestId } from '@kiosco/shared';
import { ApiError } from '../../lib/api';
import { friendlyMessage } from '../../lib/apiMessages';
import { toApiNumber, toInputText } from '../../lib/catalog/decimalInput';
import { checkMoney } from '../../lib/catalog/validation';
import { purchaseKeys, supplierKeys, suppliersApi } from '../../lib/purchases/api';
import { balanceSign, paymentSourceOptions } from '../../lib/purchases/labels';
import type { PaymentSource } from '../../lib/purchases/types';
import { ConfirmDialog } from '../ConfirmDialog';
import { FormDialog } from '../FormDialog';
import { SelectField } from '../SelectField';
import { TextField } from '../TextField';

interface PaymentDialogProps {
  supplierId: number;
  supplierName: string;
  /** Saldo actual: si es una deuda, se ofrece como monto. */
  balance: string;
  remote: boolean;
  onClose: () => void;
  onPaid: (message: string) => void;
}

interface Overpayment {
  balance: string;
  amount: string;
  balanceAfter: string;
}

export function PaymentDialog({
  supplierId,
  supplierName,
  balance,
  remote,
  onClose,
  onPaid,
}: PaymentDialogProps) {
  const queryClient = useQueryClient();
  // Un solo id por formulario: si el pedido se repite (doble clic, WiFi cortado), no se paga dos veces.
  const requestId = useRef(newClientRequestId());
  const [amount, setAmount] = useState(balanceSign(balance) > 0 ? toInputText(balance) : '');
  const [source, setSource] = useState<PaymentSource | ''>('');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; source?: string }>({});
  const [overpayment, setOverpayment] = useState<Overpayment | null>(null);

  const parsed = checkMoney(amount, 'El monto');

  const pay = useMutation({
    mutationFn: (confirmOverpayment: boolean) =>
      suppliersApi.pay(supplierId, {
        clientRequestId: requestId.current,
        amount: toApiNumber(parsed.value ?? new Decimal(0)),
        source: source as PaymentSource,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(confirmOverpayment ? { confirmOverpayment: true } : {}),
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      onPaid(
        response.isReplay
          ? 'Ese pago ya estaba registrado. No se cargó de nuevo.'
          : `Pago registrado. Saldo con ${supplierName}: ${formatMoneyWithCents(response.balance)}.`,
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'PAYMENT_EXCEEDS_BALANCE') {
        const d = error.details ?? {};
        setOverpayment({
          balance: String(d.balance ?? balance),
          amount: String(d.amount ?? toApiNumber(parsed.value ?? new Decimal(0))),
          balanceAfter: String(d.balanceAfter ?? ''),
        });
        return;
      }
      setOverpayment(null);
    },
  });

  function submit() {
    const next: { amount?: string; source?: string } = {};
    if (amount.trim() === '') next.amount = 'Escribí cuánto pagaste.';
    else if (parsed.error) next.amount = parsed.error;
    else if (parsed.value && !parsed.value.gt(0))
      next.amount = 'El monto tiene que ser mayor que cero.';
    if (source === '') next.source = 'Elegí de dónde salió la plata.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    pay.mutate(false);
  }

  if (overpayment) {
    return (
      <ConfirmDialog
        title="El pago es mayor que la deuda"
        confirmLabel="Registrar igual"
        cancelLabel="Revisar el monto"
        busy={pay.isPending}
        error={
          pay.error &&
          !(pay.error instanceof ApiError && pay.error.code === 'PAYMENT_EXCEEDS_BALANCE')
            ? pay.error
            : undefined
        }
        onCancel={() => setOverpayment(null)}
        onConfirm={() => pay.mutate(true)}
      >
        <p>
          Le debés {formatMoneyWithCents(overpayment.balance)} y estás pagando{' '}
          {formatMoneyWithCents(overpayment.amount)}.
        </p>
        <p>
          Si seguís, queda un saldo a favor del kiosco de{' '}
          <strong>
            {formatMoneyWithCents(new Decimal(overpayment.balanceAfter || '0').abs())}
          </strong>
          .
        </p>
      </ConfirmDialog>
    );
  }

  return (
    <FormDialog
      title={`Registrar un pago a ${supplierName}`}
      submitLabel="Registrar pago"
      busy={pay.isPending}
      error={pay.error ? friendlyMessage(pay.error) : undefined}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label="Monto pagado"
        hint={
          balanceSign(balance) > 0
            ? `Le debés ${formatMoneyWithCents(balance)}. Podés pagar una parte.`
            : 'Por ahora no le debés nada.'
        }
        inputMode="decimal"
        autoComplete="off"
        value={amount}
        error={errors.amount}
        data-autofocus
        onChange={(e) => setAmount(e.target.value)}
      />
      <SelectField
        label="De dónde sale la plata"
        value={source}
        placeholder="Elegí una opción"
        options={paymentSourceOptions(remote)}
        error={errors.source}
        hint={
          remote
            ? 'Solo desde el local: el efectivo de la caja no se puede usar desde afuera.'
            : 'Solo el efectivo de la caja descuenta del arqueo.'
        }
        onChange={(e) => setSource(e.target.value as PaymentSource)}
      />
      <TextField
        label="Referencia (opcional)"
        hint="Por ejemplo, el número de la transferencia."
        autoComplete="off"
        maxLength={100}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />
    </FormDialog>
  );
}
