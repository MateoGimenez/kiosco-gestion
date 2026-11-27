// Lista de compras con filtros por proveedor y fecha (encargado y dueño).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMoneyWithCents } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { purchaseKeys, purchasesApi, supplierKeys, suppliersApi } from '../lib/purchases/api';
import { DOCUMENT_TYPE_LABELS, formatDateOnly } from '../lib/purchases/labels';
import type { PurchaseListParams } from '../lib/purchases/types';

export function PurchasesPage() {
  const [supplier, setSupplier] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [numberText, setNumberText] = useState('');
  const [number, setNumber] = useState('');
  const [page, setPage] = useState(1);
  const rangeOk = from === '' || to === '' || from <= to;

  useEffect(() => {
    const timer = setTimeout(() => {
      setNumber(numberText.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [numberText]);

  const suppliers = useQuery({
    // Se piden todos (también desactivados): el filtro sirve para mirar compras viejas.
    queryKey: [...supplierKeys.all, 'filter-options'],
    queryFn: ({ signal }) => suppliersApi.list({ pageSize: 200 }, signal),
  });

  const params: PurchaseListParams = {
    page,
    ...(supplier ? { supplierId: Number(supplier) } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(number ? { documentNumber: number } : {}),
  };
  const list = useQuery({
    queryKey: purchaseKeys.list(params),
    queryFn: ({ signal }) => purchasesApi.list(params, signal),
    enabled: rangeOk,
    placeholderData: (previous) => previous,
  });
  const filtered = supplier !== '' || from !== '' || to !== '' || number !== '';

  return (
    <div className="page">
      <div className="page__header">
        <h1>Compras</h1>
        <div className="page__actions">
          <Link to="/compras/nueva" className="btn btn--primary">
            Cargar una compra
          </Link>
        </div>
      </div>

      <div className="filters">
        <SelectField
          label="Proveedor"
          value={supplier}
          placeholder="Todos"
          options={(suppliers.data?.items ?? []).map((s) => ({
            value: String(s.id),
            label: s.isActive ? s.name : `${s.name} (desactivado)`,
          }))}
          onChange={(e) => {
            setSupplier(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Desde"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Hasta"
          type="date"
          value={to}
          error={rangeOk ? undefined : 'La fecha "hasta" no puede ser anterior a "desde".'}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Número del comprobante"
          autoComplete="off"
          value={numberText}
          onChange={(e) => setNumberText(e.target.value)}
        />
      </div>

      {list.isPending && rangeOk && <LoadingState label="Cargando las compras…" />}
      {list.isError && (
        <ErrorMessage
          title="No se pudieron cargar las compras"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      )}
      {list.isSuccess && list.data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">
            {filtered ? 'No hay compras con esos filtros.' : 'Todavía no cargaste compras.'}
          </p>
          <p>
            {filtered
              ? 'Probá con otras fechas u otro proveedor.'
              : 'Cuando recibas mercadería, cargá la factura acá para sumar el stock.'}
          </p>
          {!filtered && (
            <Link to="/compras/nueva" className="btn btn--primary">
              Cargar una compra
            </Link>
          )}
        </div>
      )}
      {list.isSuccess && list.data.items.length > 0 && (
        <>
          <ul className="plist plist--purchases" aria-label="Compras">
            <li className="plist__head" aria-hidden="true">
              <span>Compra</span>
              <span className="plist__num">Total</span>
              <span className="plist__num">Pagado al cargar</span>
              <span />
            </li>
            {list.data.items.map((p) => (
              <li
                key={p.id}
                className={`plist__row${p.status === 'VOIDED' ? ' plist__row--inactive' : ''}`}
              >
                <div className="plist__who">
                  <Link to={`/compras/${p.id}`} className="plist__name">
                    {p.supplier.name} · {DOCUMENT_TYPE_LABELS[p.documentType]}
                    {p.documentNumber ? ` ${p.documentNumber}` : ''}
                  </Link>
                  <span className="plist__sub">
                    {formatDateOnly(p.documentDate)} · {p.itemCount}{' '}
                    {p.itemCount === 1 ? 'producto' : 'productos'}
                    {p.attachmentCount > 0
                      ? ` · ${p.attachmentCount} ${p.attachmentCount === 1 ? 'foto' : 'fotos'}`
                      : ''}
                  </span>
                  {p.status === 'VOIDED' && <Badge tone="off">Anulada</Badge>}
                </div>
                <div className="plist__num">
                  <span className="plist__label">Total</span>
                  {formatMoneyWithCents(p.total)}
                </div>
                <div className="plist__num">
                  <span className="plist__label">Pagado al cargar</span>
                  {formatMoneyWithCents(p.paidNowAmount)}
                </div>
                <div className="plist__state">
                  <Link to={`/compras/${p.id}`} className="btn btn--secondary">
                    Ver
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
