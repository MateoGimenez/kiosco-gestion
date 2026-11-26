// Cargar una compra (encargado y dueño). Rápida con teclado: se busca el producto, se llena la línea
// y Enter vuelve al buscador. Los totales se ven en vivo para compararlos con la factura.
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Decimal,
  formatMoneyWithCents,
  formatPercent,
  newClientRequestId,
  type ProductSaleItem,
} from '@kiosco/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { SelectField } from '../components/SelectField';
import { TextAreaField } from '../components/TextAreaField';
import { TextField } from '../components/TextField';
import { AttachmentPicker, type PickedFile } from '../components/purchases/AttachmentPicker';
import { PurchaseLineRow } from '../components/purchases/PurchaseLineRow';
import { ProductSearchBox } from '../components/sales/ProductSearchBox';
import { ApiError } from '../lib/api';
import { friendlyMessage } from '../lib/apiMessages';
import { catalogApi, keys } from '../lib/catalog/api';
import { toApiNumber, toInputText } from '../lib/catalog/decimalInput';
import { checkMoney } from '../lib/catalog/validation';
import { purchaseKeys, purchasesApi, supplierKeys, suppliersApi } from '../lib/purchases/api';
import { calculatePurchaseView, type CalcLine } from '../lib/purchases/calculate';
import { serverFieldPaths, todayDate } from '../lib/purchases/helpers';
import {
  DOCUMENT_TYPE_LABELS,
  formatDateOnly,
  paymentSourceOptions,
} from '../lib/purchases/labels';
import { checkLine, newLine, type LineDraft, type LineField } from '../lib/purchases/lines';
import type {
  CreatePurchaseBody,
  CreatePurchaseResponse,
  DocumentType,
  PaymentSource,
} from '../lib/purchases/types';
import { useIsRemote } from '../lib/useRole';

const DOC_OPTIONS = (Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((value) => ({
  value,
  label: DOCUMENT_TYPE_LABELS[value],
}));

type HeaderField = 'supplierId' | 'documentNumber' | 'documentDate' | 'otherCharges' | 'payAmount' | 'paySource' | 'lines';

interface SaveResult {
  response: CreatePurchaseResponse;
  uploadFailures: string[];
}
interface Duplicate {
  purchaseId: number | null;
  documentDate: string | null;
  total: string | null;
}
interface Overpayment {
  balance: string;
  amount: string;
  balanceAfter: string;
}

let lineCounter = 0;

export function PurchaseNewPage() {
  const [saved, setSaved] = useState<SaveResult | null>(null);
  // Cada formulario nuevo trae su propio id de pedido y se vuelve a armar desde cero.
  const [formId, setFormId] = useState(0);
  if (saved) {
    return (
      <PurchaseSaved
        result={saved}
        onAnother={() => {
          setSaved(null);
          setFormId((n) => n + 1);
        }}
      />
    );
  }
  return <PurchaseForm key={formId} onSaved={setSaved} />;
}

function PurchaseForm({ onSaved }: { onSaved: (result: SaveResult) => void }) {
  const remote = useIsRemote();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const today = todayDate();

  const [supplierId, setSupplierId] = useState(params.get('supplierId') ?? '');
  const [documentType, setDocumentType] = useState<DocumentType>('INVOICE');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentDate, setDocumentDate] = useState(today);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [otherCharges, setOtherCharges] = useState('');
  const [notes, setNotes] = useState('');
  const [payNow, setPayNow] = useState(false);
  const [paySource, setPaySource] = useState<PaymentSource | ''>('');
  const [payAmount, setPayAmount] = useState<string | null>(null); // null = igual al total
  const [payReference, setPayReference] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Partial<Record<HeaderField, string>>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, Partial<Record<LineField, string>>>>({});
  const [inactiveKeys, setInactiveKeys] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [overpayment, setOverpayment] = useState<Overpayment | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  // Un id por formulario (como en las ventas): un doble clic o un reintento no carga dos veces.
  const requestId = useRef(newClientRequestId());
  const inFlight = useRef(false);
  // Confirmaciones ya dadas (comprobante repetido, pago mayor que la deuda): se mantienen hasta que se revisa algo.
  const confirmed = useRef({ duplicate: false, overpayment: false });

  const suppliers = useQuery({
    queryKey: supplierKeys.options,
    queryFn: ({ signal }) => suppliersApi.list({ isActive: 'true', pageSize: 200 }, signal),
  });

  // Cuentas en vivo. Solo cuentan las líneas completas; las demás se marcan al guardar.
  const checks = useMemo(() => lines.map((line) => checkLine(line)), [lines]);
  const charges = checkMoney(otherCharges, 'Los otros cargos');
  const calculation = useMemo(() => {
    const complete = checks.map((c) => c.calc).filter((c): c is CalcLine => c !== null);
    return calculatePurchaseView(complete, charges.value ?? new Decimal(0));
  }, [checks, charges.value]);
  const resultByKey = useMemo(() => {
    const map = new Map<string, (typeof calculation.lines)[number]>();
    let i = 0;
    lines.forEach((line, idx) => {
      if (checks[idx]?.calc) map.set(line.key, calculation.lines[i++]!);
    });
    return map;
  }, [lines, checks, calculation]);
  const incomplete = checks.filter((c) => c.calc === null).length;
  const total = calculation.total;
  const payAmountText = payAmount ?? toInputText(total.isZero() ? '' : total.toFixed());
  const payCheck = checkMoney(payAmountText, 'El monto');

  const supplierOptions = (suppliers.data?.items ?? []).map((s) => ({
    value: String(s.id),
    label: s.name,
  }));

  async function addProduct(item: ProductSaleItem) {
    setPickError(null);
    try {
      const product = await catalogApi.product(item.id);
      lineCounter += 1;
      const key = `l${lineCounter}`;
      setLines((prev) => [
        ...prev,
        newLine(key, {
          id: product.id,
          name: product.name,
          saleUnit: product.saleUnit,
          vatRatePercent: product.vatRatePercent,
          unitsPerPack: product.unitsPerPack,
          stockQuantity: product.stockQuantity,
          defaultSupplier: product.defaultSupplier ?? null,
        }),
      ]);
      setLastAdded(key);
      setErrors((e) => ({ ...e, lines: undefined }));
    } catch (error) {
      setPickError(friendlyMessage(error));
    }
  }

  function buildBody(confirmDuplicate: boolean, confirmOver: boolean): CreatePurchaseBody {
    const body: CreatePurchaseBody = {
      clientRequestId: requestId.current,
      supplierId: Number(supplierId),
      documentType,
      documentDate,
      items: checks.map((c) => c.body!),
    };
    if (documentNumber.trim()) body.documentNumber = documentNumber.trim();
    if (charges.value && charges.value.gt(0)) body.otherChargesAmount = toApiNumber(charges.value);
    if (notes.trim()) body.notes = notes.trim();
    if (payNow && paySource && payCheck.value) {
      body.payNow = {
        source: paySource,
        amount: toApiNumber(payCheck.value),
        ...(payReference.trim() ? { reference: payReference.trim() } : {}),
      };
    }
    if (confirmDuplicate || confirmed.current.duplicate) body.confirmDuplicateDocument = true;
    if (confirmOver || confirmed.current.overpayment) body.confirmOverpayment = true;
    return body;
  }

  const save = useMutation({
    mutationFn: async (confirm: { duplicate: boolean; overpayment: boolean }) => {
      const response = await purchasesApi.create(buildBody(confirm.duplicate, confirm.overpayment));
      // Los adjuntos se suben después, uno por pedido: una foto pesada no pone en riesgo la compra.
      const uploadFailures: string[] = [];
      if (!response.isReplay) {
        for (const item of files) {
          try {
            await purchasesApi.upload(response.purchase.id, item.file);
          } catch (error) {
            uploadFailures.push(`«${item.file.name}»: ${friendlyMessage(error)}`);
          }
        }
      }
      return { response, uploadFailures };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      await queryClient.invalidateQueries({ queryKey: keys.products });
      await queryClient.invalidateQueries({ queryKey: keys.stockLists });
      onSaved(result);
    },
    onError: (error) => handleServerError(error),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function handleServerError(error: unknown) {
    setDuplicate(null);
    setOverpayment(null);
    setFormError(null);
    if (!(error instanceof ApiError)) {
      setFormError(friendlyMessage(error));
      return;
    }
    const d = error.details ?? {};
    switch (error.code) {
      case 'DUPLICATE_DOCUMENT':
        setDuplicate({
          purchaseId: typeof d.purchaseId === 'number' ? d.purchaseId : null,
          documentDate: typeof d.documentDate === 'string' ? d.documentDate : null,
          total: typeof d.total === 'string' ? d.total : null,
        });
        return;
      case 'PAYMENT_EXCEEDS_BALANCE':
        setOverpayment({
          balance: String(d.balance ?? ''),
          amount: String(d.amount ?? ''),
          balanceAfter: String(d.balanceAfter ?? ''),
        });
        return;
      case 'SUPPLIER_NOT_FOUND':
      case 'SUPPLIER_INACTIVE':
        setErrors({ supplierId: friendlyMessage(error) });
        return;
      case 'DATE_IN_FUTURE':
        setErrors({ documentDate: friendlyMessage(error) });
        return;
      case 'PRODUCT_INACTIVE':
      case 'PRODUCT_NOT_FOUND':
      case 'MISC_PRODUCT_NO_STOCK': {
        const items = Array.isArray(d.items) ? (d.items as { index?: number }[]) : [];
        const keysFound = items
          .map((it) => (typeof it.index === 'number' ? lines[it.index]?.key : undefined))
          .filter((k): k is string => k !== undefined);
        setInactiveKeys(new Set(keysFound));
        setFormError(
          error.code === 'PRODUCT_INACTIVE'
            ? 'Hay productos desactivados en la compra (marcados abajo). Reactivalos o sacalos.'
            : friendlyMessage(error),
        );
        return;
      }
      case 'VALIDATION_ERROR': {
        const next: Record<string, Partial<Record<LineField, string>>> = {};
        let other: string | null = null;
        for (const { path, message } of serverFieldPaths(error)) {
          const m = /^items\.(\d+)\.(\w+)$/.exec(path);
          const key = m ? lines[Number(m[1])]?.key : undefined;
          if (m && key) (next[key] ??= {})[m[2] as LineField] = message;
          else other ??= message;
        }
        setLineErrors(next);
        setFormError(other ?? friendlyMessage(error));
        return;
      }
      default:
        setFormError(friendlyMessage(error));
    }
  }

  function validate(): boolean {
    const next: Partial<Record<HeaderField, string>> = {};
    if (supplierId === '') next.supplierId = 'Elegí el proveedor.';
    if (documentDate === '') next.documentDate = 'Elegí la fecha del comprobante.';
    else if (documentDate > today) next.documentDate = 'La fecha no puede ser posterior a hoy.';
    if (documentNumber.length > 30) next.documentNumber = 'Puede tener hasta 30 caracteres.';
    if (lines.length === 0) next.lines = 'Agregá al menos un producto a la compra.';
    if (charges.error) next.otherCharges = charges.error;
    if (payNow) {
      if (paySource === '') next.paySource = 'Elegí de dónde sale la plata.';
      if (payCheck.error) next.payAmount = payCheck.error;
      else if (!payCheck.value || !payCheck.value.gt(0)) next.payAmount = 'Escribí cuánto pagás ahora.';
    }
    const lineErrs: Record<string, Partial<Record<LineField, string>>> = {};
    lines.forEach((line, i) => {
      const found = checks[i]!.errors;
      if (Object.keys(found).length > 0) lineErrs[line.key] = found;
    });
    setErrors(next);
    setLineErrors(lineErrs);
    setInactiveKeys(new Set());
    const incompleteLines = Object.keys(lineErrs).length > 0;
    if (!incompleteLines && lines.length > 0 && total.isZero()) {
      setFormError('La compra suma $ 0. Revisá los costos.');
      return false;
    }
    setFormError(
      incompleteLines ? 'Hay líneas incompletas o con errores. Revisalas (marcadas abajo).' : null,
    );
    return Object.keys(next).length === 0 && !incompleteLines;
  }

  function submit(confirm = { duplicate: false, overpayment: false }) {
    // Un solo pedido a la vez: un segundo clic o Ctrl+Enter mientras se guarda no hace nada.
    if (inFlight.current) return;
    if (!confirm.duplicate && !confirm.overpayment && !validate()) return;
    inFlight.current = true;
    if (confirm.duplicate) confirmed.current.duplicate = true;
    if (confirm.overpayment) confirmed.current.overpayment = true;
    save.mutate(confirm);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter') return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      submit();
      return;
    }
    // Enter dentro de un campo no guarda la compra por accidente.
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type !== 'submit' && target.type !== 'checkbox') {
      event.preventDefault();
    }
  }

  const otherSupplierWarning = (line: LineDraft) =>
    supplierId !== '' &&
    line.product.defaultSupplier &&
    line.product.defaultSupplier.id !== Number(supplierId)
      ? `Su proveedor habitual es ${line.product.defaultSupplier.name}. No se cambia solo.`
      : undefined;

  return (
    <div className="page">
      <Link to="/compras" className="back-link">
        ‹ Volver a Compras
      </Link>
      <h1>Cargar una compra</h1>

      <form className="purchase" onSubmit={onSubmit} onKeyDown={onFormKeyDown} noValidate>
        <div className="purchase__main">
          <fieldset className="fieldset">
            <legend>Comprobante</legend>
            <div className="form__row">
              <SelectField
                label="Proveedor"
                value={supplierId}
                placeholder={suppliers.isPending ? 'Cargando proveedores…' : 'Elegí un proveedor'}
                options={supplierOptions}
                error={errors.supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              />
              <SelectField
                label="Tipo de comprobante"
                value={documentType}
                options={DOC_OPTIONS}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              />
            </div>
            {suppliers.isError && (
              <ErrorMessage
                title="No se pudieron cargar los proveedores"
                error={suppliers.error}
                onRetry={() => void suppliers.refetch()}
              />
            )}
            {suppliers.isSuccess && suppliers.data.items.length === 0 && (
              <Notice variant="warning">
                Todavía no hay proveedores activos. <Link to="/proveedores/nuevo">Cargá uno</Link> para
                registrar la compra.
              </Notice>
            )}
            <div className="form__row">
              <TextField
                label="Número del comprobante (opcional)"
                hint="Por ejemplo: 0003-00012345."
                autoComplete="off"
                maxLength={30}
                value={documentNumber}
                error={errors.documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
              <TextField
                label="Fecha del comprobante"
                type="date"
                max={today}
                value={documentDate}
                error={errors.documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </div>
          </fieldset>

          <section className="fieldset purchase__products" aria-labelledby="products-title">
            <h2 id="products-title" className="fieldset__title">
              Productos
            </h2>
            <ProductSearchBox
              inputRef={searchRef}
              onPick={(p) => void addProduct(p)}
              label="Buscar el producto por código de barras o nombre"
              placeholder="Escaneá el código o escribí el nombre y apretá Enter"
              showPrice={false}
              inactiveMessage={(q) =>
                `El código ${q} es de un producto desactivado. Reactivalo desde Productos para cargarle la compra.`
              }
            />
            {pickError && <ErrorMessage title="No se pudo agregar el producto" message={pickError} />}
            {errors.lines && (
              <span className="field__error" role="alert">
                {errors.lines}
              </span>
            )}
            {lines.length === 0 ? (
              <div className="empty">
                <p className="empty__title">Todavía no agregaste productos.</p>
                <p>Pasá el lector de códigos o escribí el nombre del producto y apretá Enter.</p>
              </div>
            ) : (
              <ol className="pline-list" aria-label="Productos de la compra">
                {lines.map((line, index) => (
                  <PurchaseLineRow
                    key={line.key}
                    line={line}
                    index={index}
                    errors={lineErrors[line.key] ?? {}}
                    result={resultByKey.get(line.key) ?? null}
                    warning={otherSupplierWarning(line)}
                    inactive={inactiveKeys.has(line.key)}
                    autoFocus={line.key === lastAdded}
                    duplicated={lines.some((o) => o.key !== line.key && o.product.id === line.product.id)}
                    onChange={(next) => setLines((prev) => prev.map((l) => (l.key === line.key ? next : l)))}
                    onRemove={() => {
                      setLines((prev) => prev.filter((l) => l.key !== line.key));
                      searchRef.current?.focus();
                    }}
                    onDone={() => searchRef.current?.focus()}
                  />
                ))}
              </ol>
            )}
          </section>

          <fieldset className="fieldset">
            <legend>Fotos de la factura (opcional)</legend>
            <AttachmentPicker files={files} disabled={save.isPending} onChange={setFiles} />
          </fieldset>
        </div>

        <aside className="purchase__aside" aria-label="Totales y pago">
          <section className="totals" aria-labelledby="totals-title">
            <h2 id="totals-title">Totales</h2>
            <dl className="totals__list" aria-live="polite">
              <div>
                <dt>Neto (sin IVA)</dt>
                <dd>{formatMoneyWithCents(calculation.netTotal)}</dd>
              </div>
              {calculation.vatBreakdown.map((row) => (
                <div key={row.vatRatePercent}>
                  <dt>IVA {formatPercent(row.vatRatePercent)}</dt>
                  <dd>{formatMoneyWithCents(row.vatAmount)}</dd>
                </div>
              ))}
              {calculation.vatBreakdown.length === 0 && (
                <div>
                  <dt>IVA</dt>
                  <dd>{formatMoneyWithCents(0)}</dd>
                </div>
              )}
              <div>
                <dt>Otros cargos</dt>
                <dd>{formatMoneyWithCents(calculation.otherChargesAmount)}</dd>
              </div>
              <div className="totals__total">
                <dt>Total a pagar</dt>
                <dd data-testid="purchase-total">{formatMoneyWithCents(total)}</dd>
              </div>
            </dl>
            {incomplete > 0 && (
              <p className="field__hint">
                {incomplete === 1 ? 'Falta completar una línea' : `Faltan completar ${incomplete} líneas`}:
                no suma{incomplete === 1 ? '' : 'n'} todavía.
              </p>
            )}
            <p className="field__hint">
              Compará este total con el de la factura. Si no coincide, casi siempre es un costo mal
              escrito.
            </p>
            <TextField
              label="Otros cargos (opcional)"
              hint="Percepciones, flete… No cambian el costo de los productos."
              inputMode="decimal"
              autoComplete="off"
              value={otherCharges}
              error={errors.otherCharges}
              onChange={(e) => setOtherCharges(e.target.value)}
            />
            <TextAreaField
              label="Notas (opcional)"
              hint="Por ejemplo, qué son los otros cargos."
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </section>

          <section className="totals" aria-labelledby="pay-title">
            <h2 id="pay-title">Pago</h2>
            <label className="check">
              <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
              Pagar ahora
            </label>
            {!payNow && (
              <p className="field__hint">Si no pagás ahora, el total queda como deuda con el proveedor.</p>
            )}
            {payNow && (
              <>
                <SelectField
                  label="De dónde sale la plata"
                  value={paySource}
                  placeholder="Elegí una opción"
                  options={paymentSourceOptions(remote)}
                  error={errors.paySource}
                  hint={
                    remote
                      ? 'Solo desde el local: el efectivo de la caja no se puede usar desde afuera.'
                      : 'Solo el efectivo de la caja descuenta del arqueo.'
                  }
                  onChange={(e) => setPaySource(e.target.value as PaymentSource)}
                />
                <TextField
                  label="Monto que pagás ahora"
                  hint="Podés pagar una parte; el resto queda como deuda."
                  inputMode="decimal"
                  autoComplete="off"
                  value={payAmountText}
                  error={errors.payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
                <TextField
                  label="Referencia (opcional)"
                  maxLength={100}
                  autoComplete="off"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                />
              </>
            )}
          </section>

          {formError && <ErrorMessage title="No se pudo guardar la compra" message={formError} />}
          <Button type="submit" large loading={save.isPending}>
            Guardar la compra
          </Button>
          <p className="field__hint">Con el teclado: Ctrl + Enter guarda la compra.</p>
        </aside>
      </form>

      {duplicate && (
        <ConfirmDialog
          title="Ese comprobante ya está cargado"
          confirmLabel="Cargar igual"
          cancelLabel="Revisar el número"
          busy={save.isPending}
          onCancel={() => {
            confirmed.current = { duplicate: false, overpayment: false };
            setDuplicate(null);
          }}
          onConfirm={() => submit({ duplicate: true, overpayment: false })}
        >
          <p>
            Ya hay una compra con este número para el mismo proveedor
            {duplicate.documentDate ? ` (del ${formatDateOnly(duplicate.documentDate)}` : ''}
            {duplicate.total ? `, por ${formatMoneyWithCents(duplicate.total)}` : ''}
            {duplicate.documentDate ? ')' : ''}.
            {duplicate.purchaseId !== null && (
              <>
                {' '}
                <Link to={`/compras/${duplicate.purchaseId}`} target="_blank" rel="noopener noreferrer">
                  Ver esa compra
                </Link>
              </>
            )}
          </p>
          <p>Si cargás esta también, el stock y la deuda se suman dos veces.</p>
        </ConfirmDialog>
      )}
      {overpayment && (
        <ConfirmDialog
          title="Estás pagando más de lo que se debe"
          confirmLabel="Guardar igual"
          cancelLabel="Revisar el monto"
          busy={save.isPending}
          onCancel={() => {
            confirmed.current = { duplicate: false, overpayment: false };
            setOverpayment(null);
          }}
          onConfirm={() => submit({ duplicate: false, overpayment: true })}
        >
          <p>
            Con esta compra, la deuda es de {formatMoneyWithCents(overpayment.balance || 0)} y
            pagás {formatMoneyWithCents(overpayment.amount || 0)}.
          </p>
          <p>
            Si seguís, queda un saldo a favor del kiosco de{' '}
            <strong>{formatMoneyWithCents(new Decimal(overpayment.balanceAfter || '0').abs())}</strong>.
          </p>
        </ConfirmDialog>
      )}
      {save.isPending && <LoadingState label="Guardando la compra…" />}
    </div>
  );
}

function PurchaseSaved({ result, onAnother }: { result: SaveResult; onAnother: () => void }) {
  const { purchase, costChanges, supplierBalance, isReplay } = result.response;
  return (
    <div className="page">
      <h1>{isReplay ? 'Esta compra ya estaba cargada' : 'Compra guardada'}</h1>
      <Notice variant="success">
        {isReplay
          ? 'No se cargó de nuevo: el stock y la deuda no se sumaron otra vez.'
          : `Compra n.º ${purchase.id} de ${purchase.supplier.name}: el stock subió y la deuda se sumó.`}
      </Notice>
      <dl className="facts">
        <div>
          <dt>Total de la compra</dt>
          <dd className="facts__big">{formatMoneyWithCents(purchase.total)}</dd>
        </div>
        <div>
          <dt>Saldo con {purchase.supplier.name}</dt>
          <dd className="facts__big">{formatMoneyWithCents(supplierBalance)}</dd>
        </div>
      </dl>

      {result.uploadFailures.length > 0 && (
        <div className="error-message" role="alert">
          <p className="error-message__title">La compra se guardó, pero no se pudieron subir algunos archivos</p>
          <ul className="attach__problems">
            {result.uploadFailures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p>Podés subirlos de nuevo desde el detalle de la compra.</p>
        </div>
      )}

      <section className="panel panel--wide" aria-labelledby="cost-title">
        <h2 id="cost-title">Cambios de costo</h2>
        {costChanges.length === 0 ? (
          <p>El costo de ningún producto cambió con esta compra.</p>
        ) : (
          <>
            <p>
              Cambió el costo de {costChanges.length}{' '}
              {costChanges.length === 1 ? 'producto' : 'productos'}. El precio de venta no se toca
              solo: revisalo en Precios.
            </p>
            <ul className="plist plist--costs" aria-label="Productos con costo nuevo">
              <li className="plist__head" aria-hidden="true">
                <span>Producto</span>
                <span className="plist__num">Costo sin IVA</span>
                <span className="plist__num">Precio de venta hoy</span>
                <span />
              </li>
              {costChanges.map((c) => {
                const pct = c.netCostChangePercent;
                return (
                  <li key={c.productId} className="plist__row">
                    <div className="plist__who">
                      <span className="plist__name">{c.productName}</span>
                    </div>
                    <div className="plist__num">
                      <span className="plist__label">Costo sin IVA</span>
                      {formatMoneyWithCents(c.previousNetCostPrice)} →{' '}
                      <strong>{formatMoneyWithCents(c.newNetCostPrice)}</strong>
                      <span className={`plist__sub${pct?.startsWith('-') ? '' : ' text-bad'}`}>
                        {pct === null
                          ? 'Antes no tenía costo'
                          : `${pct.startsWith('-') ? '' : '+'}${pct.replace('.', ',')} %`}
                      </span>
                    </div>
                    <div className="plist__num">
                      <span className="plist__label">Precio de venta hoy</span>
                      {formatMoneyWithCents(c.salePrice)}
                    </div>
                    <div className="plist__state">
                      <Link to={`/pricing/${c.productId}`} className="btn btn--secondary">
                        Revisar precio
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div className="form__actions">
        <Link to={`/compras/${purchase.id}`} className="btn btn--secondary btn--large">
          Ver la compra
        </Link>
        <Button large onClick={onAnother}>
          Cargar otra compra
        </Button>
      </div>
    </div>
  );
}
