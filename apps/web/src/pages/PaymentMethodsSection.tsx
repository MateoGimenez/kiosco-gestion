// Medios de pago (solo dueño, dentro de Configuración): recargo del crédito, activar y orden.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { friendlyMessage } from '../lib/apiMessages';
import { toApiNumber, toInputText } from '../lib/catalog/decimalInput';
import { checkPercent } from '../lib/catalog/validation';
import { salesApi, salesKeys } from '../lib/sales/api';
import type { PaymentMethod } from '../lib/sales/types';

export function PaymentMethodsSection() {
  const methods = useQuery({
    queryKey: salesKeys.paymentMethods,
    queryFn: ({ signal }) => salesApi.paymentMethods(signal),
  });
  return (
    <section className="panel panel--wide" aria-labelledby="methods-title">
      <div>
        <h2 id="methods-title">Medios de pago</h2>
        <p className="page__sub">
          El recargo solo se aplica al crédito y se suma al cobrar. Las ventas ya hechas no cambian.
        </p>
      </div>
      {methods.isPending && <LoadingState label="Cargando los medios de pago…" />}
      {methods.isError && (
        <ErrorMessage
          title="No se pudieron cargar los medios de pago"
          error={methods.error}
          onRetry={() => void methods.refetch()}
        />
      )}
      {methods.isSuccess && methods.data.items.length === 0 && (
        <p>No hay medios de pago cargados.</p>
      )}
      {methods.isSuccess && (
        <ul className="methods">
          {[...methods.data.items]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
            .map((method, index, all) => (
              <MethodRow
                key={method.id}
                method={method}
                previous={all[index - 1]}
                next={all[index + 1]}
              />
            ))}
        </ul>
      )}
    </section>
  );
}

function MethodRow({
  method,
  previous,
  next,
}: {
  method: PaymentMethod;
  previous: PaymentMethod | undefined;
  next: PaymentMethod | undefined;
}) {
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState(toInputText(method.surchargePercent));
  const [percentError, setPercentError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const isCredit = method.kind === 'CREDIT_CARD';
  const isCash = method.kind === 'CASH';

  const update = useMutation({
    mutationFn: (body: Parameters<typeof salesApi.updatePaymentMethod>[1]) =>
      salesApi.updatePaymentMethod(method.id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: salesKeys.paymentMethods }),
  });
  // Para subir o bajar un medio se intercambian los órdenes con el vecino (dos pedidos).
  const move = useMutation({
    mutationFn: async (other: PaymentMethod) => {
      const a =
        method.sortOrder === other.sortOrder
          ? other.sortOrder + (other.id > method.id ? 1 : -1)
          : other.sortOrder;
      await salesApi.updatePaymentMethod(method.id, { sortOrder: a });
      await salesApi.updatePaymentMethod(other.id, { sortOrder: method.sortOrder });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: salesKeys.paymentMethods }),
  });

  function savePercent() {
    const check = checkPercent(percent, 'El recargo');
    if (check.error) return setPercentError(check.error);
    if (check.value === null)
      return setPercentError('Escribí el recargo. Con 0 no se cobra recargo.');
    if (check.value.gt(100)) return setPercentError('El máximo es 100 %.');
    setPercentError(undefined);
    setSaved(false);
    update.mutate(
      { surchargePercent: toApiNumber(check.value) },
      { onSuccess: () => setSaved(true) },
    );
  }

  const error = update.error ?? move.error;
  return (
    <li className={`methods__row${method.isActive ? '' : ' methods__row--off'}`}>
      <div className="methods__name">
        <strong>{method.name}</strong>
        {method.isActive ? <Badge tone="ok">Activo</Badge> : <Badge tone="off">Desactivado</Badge>}
      </div>
      <div className="methods__surcharge">
        {isCredit ? (
          <>
            <label htmlFor={`pct-${method.id}`} className="field__label">
              Recargo (%)
            </label>
            <div className="methods__pct">
              <input
                id={`pct-${method.id}`}
                className="field__input"
                inputMode="decimal"
                autoComplete="off"
                value={percent}
                aria-invalid={percentError ? true : undefined}
                onChange={(e) => {
                  setPercent(e.target.value);
                  setSaved(false);
                }}
              />
              <Button
                variant="secondary"
                onClick={savePercent}
                loading={update.isPending}
                disabled={percent === toInputText(method.surchargePercent)}
              >
                Guardar recargo
              </Button>
            </div>
            {percentError && <span className="field__error">{percentError}</span>}
            {saved && <span className="methods__ok">Se guardó el recargo.</span>}
          </>
        ) : (
          <span className="page__note">Sin recargo</span>
        )}
      </div>
      <div className="methods__actions">
        {isCash ? (
          <span className="page__note">Siempre activo</span>
        ) : (
          <Button
            variant="secondary"
            loading={update.isPending}
            onClick={() => update.mutate({ isActive: !method.isActive })}
          >
            {method.isActive ? 'Desactivar' : 'Activar'}
          </Button>
        )}
        <Button
          variant="secondary"
          aria-label={`Subir ${method.name}`}
          disabled={!previous || move.isPending}
          onClick={() => previous && move.mutate(previous)}
        >
          Subir
        </Button>
        <Button
          variant="secondary"
          aria-label={`Bajar ${method.name}`}
          disabled={!next || move.isPending}
          onClick={() => next && move.mutate(next)}
        >
          Bajar
        </Button>
      </div>
      {error && (
        <div className="methods__error">
          <Notice variant="warning">{friendlyMessage(error)}</Notice>
        </div>
      )}
    </li>
  );
}
