// Cuenta corriente de un proveedor: saldo, movimientos con saldo acumulado y acciones.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal, formatMoneyWithCents } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { Pagination } from '../components/Pagination';
import { BalanceEntryDialog } from '../components/purchases/BalanceEntryDialog';
import { PaymentDialog } from '../components/purchases/PaymentDialog';
import { RefundDialog } from '../components/purchases/RefundDialog';
import { supplierKeys, suppliersApi } from '../lib/purchases/api';
import {
  DOCUMENT_TYPE_LABELS,
  ENTRY_TYPE_LABELS,
  PAYMENT_SOURCE_LABELS,
  REFUND_SOURCE_LABELS,
  WEEKDAYS,
  balanceCaption,
  balanceSign,
  formatDateOnly,
  formatPhone,
  formatTaxId,
} from '../lib/purchases/labels';
import type { AccountEntry } from '../lib/purchases/types';
import { useIsRemote, useRole } from '../lib/useRole';

type Dialog = 'payment' | 'refund' | 'opening' | 'adjustment' | 'deactivate' | null;

export function SupplierDetailPage() {
  const supplierId = Number(useParams().id);
  const role = useRole();
  const remote = useIsRemote();
  const isOwner = role === 'OWNER';
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  // Desde una compra anulada se llega con ?devolucion=<n° de compra>: abre la devolución con la descripción lista.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromPurchase = searchParams.get('devolucion');
  const [dialog, setDialog] = useState<Dialog>(fromPurchase !== null ? 'refund' : null);
  const [refundDescription, setRefundDescription] = useState(() =>
    fromPurchase && /^\d+$/.test(fromPurchase)
      ? `Devuelve lo pagado de la compra #${fromPurchase} (anulada)`
      : '',
  );
  useEffect(() => {
    if (searchParams.has('devolucion')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  useEffect(() => {
    if ((location.state as { notice?: string } | null)?.notice) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const supplier = useQuery({
    queryKey: supplierKeys.detail(supplierId),
    queryFn: ({ signal }) => suppliersApi.get(supplierId, signal),
  });
  const account = useQuery({
    queryKey: supplierKeys.account(supplierId, page),
    queryFn: ({ signal }) => suppliersApi.account(supplierId, page, signal),
    placeholderData: (previous) => previous,
  });

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => suppliersApi.update(supplierId, { isActive }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      setDialog(null);
      setNotice(saved.isActive ? 'Proveedor reactivado.' : 'Proveedor desactivado.');
    },
  });

  function openRefund() {
    setRefundDescription('');
    setDialog('refund');
  }

  if (supplier.isPending) return <LoadingState label="Cargando el proveedor…" />;
  if (supplier.isError) {
    return (
      <div className="page">
        <ErrorMessage
          title="No se pudo cargar el proveedor"
          error={supplier.error}
          onRetry={() => void supplier.refetch()}
        />
      </div>
    );
  }
  const s = supplier.data;
  const balance = account.data?.balance ?? s.balance;
  const owed = balanceSign(balance) > 0;
  const hasCredit = balanceSign(balance) < 0;
  const days = s.visitDays
    .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="page">
      <Link to="/proveedores" className="back-link">
        ‹ Volver a Proveedores
      </Link>
      <div className="page__header">
        <div className="titleblock">
          <h1>{s.name}</h1>
          <div className="titleblock__badges">
            {!s.isActive && <Badge tone="off">Desactivado</Badge>}
          </div>
        </div>
        <div className="page__actions">
          <Link to={`/proveedores/${s.id}/editar`} className="btn btn--secondary">
            Editar
          </Link>
          <Button variant="secondary" onClick={() => setDialog('deactivate')}>
            {s.isActive ? 'Desactivar' : 'Reactivar'}
          </Button>
        </div>
      </div>

      {notice && <Notice variant="success">{notice}</Notice>}

      <section className="panel panel--wide" aria-label="Saldo">
        <div className="balance">
          <div>
            <p className="balance__caption">
              {hasCredit ? 'Saldo a favor del kiosco' : balanceCaption(balance)}
            </p>
            <p
              className={`balance__value${owed ? ' text-bad' : ''}${hasCredit ? ' text-good' : ''}`}
            >
              {formatMoneyWithCents(hasCredit ? new Decimal(balance).abs() : balance)}
            </p>
          </div>
          <div className="page__actions">
            {hasCredit && (
              <Button large onClick={() => openRefund()}>
                Registrar devolución
              </Button>
            )}
            <Button
              large
              variant={hasCredit ? 'secondary' : 'primary'}
              onClick={() => setDialog('payment')}
            >
              Registrar un pago
            </Button>
            {s.isActive && (
              <Link
                to={`/compras/nueva?supplierId=${s.id}`}
                className="btn btn--secondary btn--large"
              >
                Cargar una compra
              </Link>
            )}
            <Link to={`/proveedores/${s.id}/pedido`} className="btn btn--secondary btn--large">
              Pedido sugerido
            </Link>
          </div>
        </div>
        <dl className="facts">
          <div>
            <dt>Teléfono</dt>
            <dd>{s.phone ? formatPhone(s.phone) : 'Sin teléfono'}</dd>
          </div>
          <div>
            <dt>CUIT</dt>
            <dd>{s.taxId ? formatTaxId(s.taxId) : 'Sin CUIT'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{s.email ?? 'Sin email'}</dd>
          </div>
          <div>
            <dt>Cuándo viene</dt>
            <dd>{days || 'Sin días cargados'}</dd>
          </div>
          <div>
            <dt>Productos habituales</dt>
            <dd>
              {s.defaultProductCount}{' '}
              <Link to={`/proveedores/${s.id}/productos`}>Asignar productos</Link>
            </dd>
          </div>
          {s.notes && (
            <div>
              <dt>Notas</dt>
              <dd>{s.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="account-title" className="stack">
        <div className="page__header">
          <h2 id="account-title">Movimientos</h2>
          <div className="page__actions">
            {!hasCredit && (
              <Button variant="secondary" onClick={() => openRefund()}>
                Registrar devolución
              </Button>
            )}
            {isOwner && (
              <>
                {!s.hasOpeningBalance && (
                  <Button variant="secondary" onClick={() => setDialog('opening')}>
                    Cargar saldo inicial
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setDialog('adjustment')}>
                  Corregir la cuenta
                </Button>
              </>
            )}
          </div>
        </div>

        {account.isPending && <LoadingState label="Cargando los movimientos…" />}
        {account.isError && (
          <ErrorMessage
            title="No se pudieron cargar los movimientos"
            error={account.error}
            onRetry={() => void account.refetch()}
          />
        )}
        {account.isSuccess && account.data.items.length === 0 && (
          <div className="empty">
            <p className="empty__title">Todavía no hay movimientos.</p>
            <p>Cuando cargues una compra o registres un pago, van a aparecer acá.</p>
          </div>
        )}
        {account.isSuccess && account.data.items.length > 0 && (
          <>
            <ul className="plist plist--account" aria-label="Movimientos de la cuenta">
              <li className="plist__head" aria-hidden="true">
                <span>Movimiento</span>
                <span className="plist__num">Importe</span>
                <span className="plist__num">Saldo</span>
              </li>
              {account.data.items.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
            <Pagination
              page={account.data.page}
              pageSize={account.data.pageSize}
              total={account.data.total}
              onPage={setPage}
            />
          </>
        )}
      </section>

      {dialog === 'payment' && (
        <PaymentDialog
          supplierId={s.id}
          supplierName={s.name}
          balance={balance}
          remote={remote}
          onClose={() => setDialog(null)}
          onPaid={(message) => {
            setDialog(null);
            setNotice(message);
          }}
        />
      )}
      {dialog === 'refund' && (
        <RefundDialog
          supplierId={s.id}
          supplierName={s.name}
          balance={balance}
          remote={remote}
          initialDescription={refundDescription}
          onClose={() => setDialog(null)}
          onRefunded={(message) => {
            setDialog(null);
            setNotice(message);
          }}
        />
      )}
      {(dialog === 'opening' || dialog === 'adjustment') && isOwner && (
        <BalanceEntryDialog
          kind={dialog}
          supplierId={s.id}
          supplierName={s.name}
          onClose={() => setDialog(null)}
          onSaved={(message) => {
            setDialog(null);
            setNotice(message);
          }}
        />
      )}
      {dialog === 'deactivate' && (
        <ConfirmDialog
          title={s.isActive ? '¿Desactivar este proveedor?' : '¿Reactivar este proveedor?'}
          confirmLabel={s.isActive ? 'Sí, desactivar' : 'Sí, reactivar'}
          danger={s.isActive}
          busy={toggleActive.isPending}
          error={toggleActive.error}
          onCancel={() => setDialog(null)}
          onConfirm={() => toggleActive.mutate(!s.isActive)}
        >
          {s.isActive ? (
            <p>
              Ya no se le van a poder cargar compras. La cuenta y el historial quedan, y se le
              pueden seguir registrando pagos. Los productos conservan a este proveedor como
              habitual.
            </p>
          ) : (
            <p>Vuelve a aparecer para cargarle compras.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: AccountEntry }) {
  const negative = entry.amount.startsWith('-');
  const detail: string[] = [];
  if (entry.type === 'PAYMENT' && entry.paymentSource) {
    detail.push(PAYMENT_SOURCE_LABELS[entry.paymentSource]);
  }
  if (entry.type === 'REFUND' && entry.paymentSource) {
    detail.push(REFUND_SOURCE_LABELS[entry.paymentSource]);
  }
  if (entry.reference) detail.push(entry.reference);
  if (entry.description) detail.push(entry.description);
  return (
    <li className="plist__row">
      <div className="plist__who">
        <span className="plist__name">
          {ENTRY_TYPE_LABELS[entry.type]}
          {entry.purchase && (
            <>
              {' '}
              <Link to={`/compras/${entry.purchase.id}`}>
                {DOCUMENT_TYPE_LABELS[entry.purchase.documentType]}
                {entry.purchase.documentNumber
                  ? ` ${entry.purchase.documentNumber}`
                  : ` #${entry.purchase.id}`}
              </Link>
            </>
          )}
        </span>
        <span className="plist__sub">
          {[formatDateOnly(entry.entryDate), ...detail, entry.user.fullName].join(' · ')}
          {entry.cashMovement && (
            <>
              {' · '}
              <Link to={`/caja/${entry.cashMovement.cashSessionId}`}>
                Ver la caja #{entry.cashMovement.cashSessionId}
              </Link>
            </>
          )}
        </span>
      </div>
      <div className={`plist__num${negative ? ' text-good' : ''}`}>
        <span className="plist__label">Importe</span>
        {formatMoneyWithCents(entry.amount)}
      </div>
      <div className="plist__num">
        <span className="plist__label">Saldo</span>
        {formatMoneyWithCents(entry.balanceAfter)}
      </div>
    </li>
  );
}
