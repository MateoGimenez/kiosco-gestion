// Alta y edición de productos (encargado y dueño).
// El stock NO se edita acá: se cambia con un ajuste. El margen propio solo lo edita el dueño.
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal, VAT_RATES, formatPercent } from '@kiosco/shared';
import { BelowCostDialog } from '../components/BelowCostDialog';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { ApiError } from '../lib/api';
import { friendlyMessage } from '../lib/apiMessages';
import { serverErrorToFields, type FieldErrors } from '../lib/formErrors';
import { catalogApi, keys } from '../lib/catalog/api';
import { belowCostDetails, sellsBelowCost, type BelowCostDetails } from '../lib/catalog/belowCost';
import { toApiNumber, toInputText } from '../lib/catalog/decimalInput';
import { SALE_UNIT_LABELS, quantityText } from '../lib/catalog/labels';
import {
  chooseMargin,
  formatPrice,
  liveRealMargin,
  liveSuggestedPrice,
} from '../lib/catalog/pricing';
import type {
  CreateProductRequest,
  Product,
  SaleUnit,
  UpdateProductRequest,
} from '../lib/catalog/types';
import { checkMoney, checkPercent, checkQuantity } from '../lib/catalog/validation';
import { useRole } from '../lib/useRole';

const FIELDS = [
  'name',
  'barcode',
  'saleUnit',
  'subcategoryId',
  'vatRatePercent',
  'netCostPrice',
  'marginPercent',
  'salePrice',
  'minStock',
  'unitsPerPack',
  'initialStock',
] as const;
type FieldName = (typeof FIELDS)[number];

const VAT_OPTIONS = VAT_RATES.map((v) => ({ value: v, label: formatPercent(v) }));

interface FormState {
  name: string;
  barcode: string;
  saleUnit: SaleUnit;
  categoryId: string;
  subcategoryId: string;
  vat: string;
  netCost: string;
  margin: string;
  price: string;
  priceTouched: boolean;
  minStock: string;
  unitsPerPack: string;
  initialStock: string;
}

function initialState(product: Product | undefined, barcode: string): FormState {
  return {
    name: product?.name ?? '',
    barcode: product ? (product.barcode ?? '') : barcode,
    saleUnit: product?.saleUnit ?? 'UNIT',
    categoryId: product ? String(product.category.id) : '',
    subcategoryId: product ? String(product.subcategory.id) : '',
    vat: product ? new Decimal(product.vatRatePercent).toFixed() : '21',
    netCost: '',
    margin: '',
    price: '',
    priceTouched: false,
    minStock: product ? toInputText(product.minStock) : '',
    unitsPerPack: product?.unitsPerPack ? toInputText(product.unitsPerPack) : '',
    initialStock: '',
  };
}

export function ProductFormPage() {
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const [searchParams] = useSearchParams();

  const product = useQuery({
    queryKey: keys.product(editingId ?? 0),
    queryFn: ({ signal }) => catalogApi.product(editingId ?? 0, signal),
    enabled: editingId !== null,
  });

  if (editingId !== null && product.isPending)
    return <LoadingState label="Cargando el producto…" />;
  if (editingId !== null && product.isError) {
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
  return (
    <ProductForm
      product={editingId !== null ? product.data : undefined}
      presetBarcode={searchParams.get('barcode') ?? ''}
    />
  );
}

function ProductForm({
  product,
  presetBarcode,
}: {
  product: Product | undefined;
  presetBarcode: string;
}) {
  const editing = product !== undefined;
  const isOwner = useRole() === 'OWNER';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const misc = product?.isMiscellaneous ?? false;

  const [form, setForm] = useState<FormState>(() => initialState(product, presetBarcode));
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Venta a pérdida: el servidor pide confirmación (422 PRICE_BELOW_COST).
  const [belowCost, setBelowCost] = useState<BelowCostDetails | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Datos que hacen falta para calcular el sugerido en vivo (solo en el alta).
  const categories = useQuery({
    queryKey: keys.categories,
    queryFn: ({ signal }) => catalogApi.categories(signal),
  });
  const settings = useQuery({
    queryKey: keys.settings,
    queryFn: ({ signal }) => catalogApi.settings(signal),
    enabled: !editing,
  });

  const category = categories.data?.items.find((c) => String(c.id) === form.categoryId);
  const subcategory = category?.subcategories.find((s) => String(s.id) === form.subcategoryId);

  // Se ofrecen las activas; en la edición se conserva la actual aunque esté desactivada.
  const categoryOptions = (categories.data?.items ?? [])
    .filter((c) => c.isActive || String(c.id) === form.categoryId)
    .map((c) => ({ value: String(c.id), label: c.isActive ? c.name : `${c.name} (desactivada)` }));
  const subcategoryOptions = (category?.subcategories ?? [])
    .filter((s) => s.isActive || String(s.id) === form.subcategoryId)
    .map((s) => ({ value: String(s.id), label: s.isActive ? s.name : `${s.name} (desactivada)` }));

  // Precio sugerido en vivo: costo neto × (1 + margen) × (1 + IVA), hacia arriba al paso configurado.
  const live = useMemo(() => {
    const netCost = checkMoney(form.netCost, 'El costo').value;
    const ownMargin = isOwner ? checkPercent(form.margin, 'El margen').value : null;
    const margin =
      ownMargin !== null
        ? { percent: toApiNumber(ownMargin), source: 'PRODUCT' as const }
        : category?.marginPercent !== undefined
          ? chooseMargin(null, subcategory?.marginPercent, category.marginPercent)
          : null;
    const step = settings.data?.priceRoundingStep ?? '10';
    const suggested = liveSuggestedPrice(netCost, margin?.percent ?? null, form.vat, step);
    return { netCost, margin, suggested };
  }, [form.netCost, form.margin, form.vat, isOwner, category, subcategory, settings.data]);

  const priceText =
    form.priceTouched || !live.suggested ? form.price : toInputText(live.suggested.toFixed());
  const priceCheck = checkMoney(priceText, 'El precio');
  const realMargin = liveRealMargin(priceCheck.value, live.netCost, form.vat);
  const losing = sellsBelowCost(priceCheck.value, live.netCost, form.vat);
  const priceDiffers =
    priceCheck.value !== null &&
    live.suggested !== null &&
    !priceCheck.value.equals(live.suggested);

  const save = useMutation({
    mutationFn: (confirmBelowCost: boolean): Promise<unknown> => {
      if (!editing) return catalogApi.createProduct(buildCreate(confirmBelowCost));
      return catalogApi.updateProduct(product.id, buildUpdate());
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: keys.products });
      await queryClient.invalidateQueries({ queryKey: keys.stockLists });
      const savedId = (saved as { id: number }).id;
      void navigate(`/productos/${savedId}`, {
        state: { notice: editing ? 'Cambios guardados.' : 'Producto creado.' },
      });
    },
    onError: (error) => {
      const loss = belowCostDetails(error);
      if (loss) {
        setBelowCost(loss);
        return;
      }
      // Cualquier otro error se ve en el formulario, no detrás del diálogo.
      setBelowCost(null);
      if (error instanceof ApiError && typeof error.details?.field === 'string') {
        const field = FIELDS.find((f) => f === error.details?.field);
        if (field) {
          setErrors({ [field]: friendlyMessage(error) });
          return;
        }
      }
      const mapped = serverErrorToFields(error, FIELDS);
      setErrors(mapped.fields);
      setFormError(mapped.form ?? null);
    },
  });

  function buildCreate(confirmBelowCost: boolean): CreateProductRequest {
    const body: CreateProductRequest = {
      name: form.name.trim(),
      saleUnit: form.saleUnit,
      subcategoryId: Number(form.subcategoryId),
      vatRatePercent: form.vat,
      salePrice: toApiNumber(priceCheck.value ?? new Decimal(0)),
    };
    if (confirmBelowCost) body.confirmBelowCost = true;
    if (form.barcode.trim()) body.barcode = form.barcode.trim();
    if (live.netCost) body.netCostPrice = toApiNumber(live.netCost);
    // El encargado nunca manda el margen propio (el servidor responde 403).
    const margin = isOwner ? checkPercent(form.margin, '').value : null;
    if (margin) body.marginPercent = toApiNumber(margin);
    const min = checkQuantity(form.minStock, form.saleUnit, '').value;
    if (min) body.minStock = toApiNumber(min);
    const pack = checkQuantity(form.unitsPerPack, form.saleUnit, '').value;
    if (pack) body.unitsPerPack = toApiNumber(pack);
    const initial = checkQuantity(form.initialStock, form.saleUnit, '').value;
    if (initial && initial.gt(0)) body.initialStock = toApiNumber(initial);
    return body;
  }

  function buildUpdate(): UpdateProductRequest {
    const body: UpdateProductRequest = {};
    if (!product) return body;
    if (form.name.trim() !== product.name) body.name = form.name.trim();
    if (new Decimal(form.vat).toFixed() !== new Decimal(product.vatRatePercent).toFixed()) {
      body.vatRatePercent = form.vat;
    }
    if (misc) return body;
    const barcode = form.barcode.trim();
    if (barcode !== (product.barcode ?? '')) body.barcode = barcode === '' ? null : barcode;
    if (form.saleUnit !== product.saleUnit) body.saleUnit = form.saleUnit;
    if (Number(form.subcategoryId) !== product.subcategory.id) {
      body.subcategoryId = Number(form.subcategoryId);
    }
    const min = checkQuantity(form.minStock, form.saleUnit, '').value ?? new Decimal(0);
    if (!min.equals(product.minStock)) body.minStock = toApiNumber(min);
    const pack = checkQuantity(form.unitsPerPack, form.saleUnit, '').value;
    const oldPack = product.unitsPerPack ? new Decimal(product.unitsPerPack) : null;
    if ((pack === null) !== (oldPack === null) || (pack && oldPack && !pack.equals(oldPack))) {
      body.unitsPerPack = pack ? toApiNumber(pack) : null;
    }
    return body;
  }

  function validate(): FieldErrors<FieldName> {
    const next: FieldErrors<FieldName> = {};
    if (form.name.trim() === '') next.name = 'Escribí el nombre del producto.';
    else if (form.name.trim().length > 120)
      next.name = 'El nombre puede tener hasta 120 caracteres.';
    if (form.barcode.trim() !== '' && !/^[\x21-\x7E]{1,50}$/.test(form.barcode.trim())) {
      next.barcode = 'El código no puede tener espacios y llega hasta 50 caracteres.';
    }
    if (misc) return next;
    if (form.subcategoryId === '') next.subcategoryId = 'Elegí la categoría y la subcategoría.';
    const min = checkQuantity(form.minStock, form.saleUnit, 'El mínimo');
    if (min.error) next.minStock = min.error;
    const pack = checkQuantity(form.unitsPerPack, form.saleUnit, 'Las unidades por bulto');
    if (pack.error) next.unitsPerPack = pack.error;
    else if (pack.value?.isZero())
      next.unitsPerPack = 'Tiene que ser mayor que cero, o dejalo vacío.';
    if (!editing) {
      const cost = checkMoney(form.netCost, 'El costo');
      if (cost.error) next.netCostPrice = cost.error;
      if (isOwner) {
        const margin = checkPercent(form.margin, 'El margen');
        if (margin.error) next.marginPercent = margin.error;
      }
      if (priceText.trim() === '') next.salePrice = 'Escribí el precio de venta.';
      else if (priceCheck.error) next.salePrice = priceCheck.error;
      const initial = checkQuantity(form.initialStock, form.saleUnit, 'El stock inicial');
      if (initial.error) next.initialStock = initial.error;
    }
    return next;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(false);
  }

  const backTo = editing ? `/productos/${product.id}` : '/productos';
  const loading = categories.isPending || (!editing && settings.isPending);
  const loadError = categories.error ?? (!editing ? settings.error : null);

  return (
    <div className="page">
      <Link to={backTo} className="back-link">
        ‹ {editing ? 'Volver a la ficha' : 'Volver a Productos'}
      </Link>
      <h1>{editing ? `Editar ${product.name}` : 'Nuevo producto'}</h1>

      {loading && <LoadingState label="Cargando categorías…" />}
      {loadError && (
        <ErrorMessage
          title="No se pudieron cargar los datos del formulario"
          error={loadError}
          onRetry={() => {
            void categories.refetch();
            void settings.refetch();
          }}
        />
      )}

      {!loading && !loadError && (
        <form className="form form--wide" onSubmit={onSubmit} noValidate>
          {misc && (
            <Notice variant="info">
              "Varios" es un producto especial: solo se pueden cambiar el nombre y el IVA.
            </Notice>
          )}

          <fieldset className="fieldset">
            <legend>Datos del producto</legend>
            <TextField
              label="Nombre"
              value={form.name}
              maxLength={120}
              autoFocus
              error={errors.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <TextField
              label="Código de barras (opcional)"
              hint="Pasá el lector por acá, o dejalo vacío."
              value={form.barcode}
              autoComplete="off"
              disabled={misc}
              error={errors.barcode}
              onChange={(e) => set('barcode', e.target.value)}
            />
            <div className="form__row">
              <SelectField
                label="Se vende"
                value={form.saleUnit}
                disabled={misc}
                options={(Object.keys(SALE_UNIT_LABELS) as SaleUnit[]).map((u) => ({
                  value: u,
                  label: SALE_UNIT_LABELS[u],
                }))}
                error={errors.saleUnit}
                onChange={(e) => set('saleUnit', e.target.value as SaleUnit)}
              />
              <SelectField
                label="IVA"
                value={form.vat}
                options={VAT_OPTIONS}
                error={errors.vatRatePercent}
                onChange={(e) => set('vat', e.target.value)}
              />
            </div>
            <div className="form__row">
              <SelectField
                label="Categoría"
                value={form.categoryId}
                placeholder="Elegí una categoría"
                disabled={misc}
                options={categoryOptions}
                onChange={(e) =>
                  setForm((p) => ({ ...p, categoryId: e.target.value, subcategoryId: '' }))
                }
              />
              <SelectField
                label="Subcategoría"
                value={form.subcategoryId}
                placeholder="Elegí una subcategoría"
                disabled={misc || !form.categoryId}
                options={subcategoryOptions}
                error={errors.subcategoryId}
                onChange={(e) => set('subcategoryId', e.target.value)}
              />
            </div>
          </fieldset>

          {!misc && (
            <fieldset className="fieldset">
              <legend>Stock</legend>
              <div className="form__row">
                <TextField
                  label="Stock mínimo"
                  hint="Por debajo de este número, aparece en “Para reponer”."
                  inputMode="decimal"
                  value={form.minStock}
                  placeholder="0"
                  error={errors.minStock}
                  onChange={(e) => set('minStock', e.target.value)}
                />
                <TextField
                  label="Unidades por bulto (opcional)"
                  hint="Para sugerir cuánto pedir."
                  inputMode="decimal"
                  value={form.unitsPerPack}
                  error={errors.unitsPerPack}
                  onChange={(e) => set('unitsPerPack', e.target.value)}
                />
              </div>
              {editing ? (
                <div className="callout">
                  <p>
                    <strong>
                      Stock actual: {quantityText(product.stockQuantity, product.saleUnit)}
                    </strong>
                  </p>
                  <p>
                    El stock no se cambia desde acá: así queda registrado qué pasó. Para corregirlo,
                    usá un ajuste.
                  </p>
                  <Link to={`/productos/${product.id}/ajustar`} className="btn btn--secondary">
                    Ajustar stock
                  </Link>
                </div>
              ) : (
                <TextField
                  label="Stock inicial (opcional)"
                  hint="Lo que hay hoy en el local. Queda registrado como “carga inicial”."
                  inputMode="decimal"
                  value={form.initialStock}
                  placeholder="0"
                  error={errors.initialStock}
                  onChange={(e) => set('initialStock', e.target.value)}
                />
              )}
            </fieldset>
          )}

          {!editing && (
            <fieldset className="fieldset">
              <legend>Costo y precio</legend>
              <div className="form__row">
                <TextField
                  label="Costo sin IVA"
                  hint="Lo que pagás por unidad, sin el IVA."
                  inputMode="decimal"
                  value={form.netCost}
                  placeholder="0"
                  error={errors.netCostPrice}
                  onChange={(e) => set('netCost', e.target.value)}
                />
                {isOwner ? (
                  <TextField
                    label="Margen propio (opcional)"
                    hint="Vacío: usa el de la subcategoría o la categoría."
                    inputMode="decimal"
                    value={form.margin}
                    placeholder="%"
                    error={errors.marginPercent}
                    onChange={(e) => set('margin', e.target.value)}
                  />
                ) : (
                  <div className="field">
                    <span className="field__label">Margen</span>
                    <span className="field__static">
                      {live.margin ? formatPercent(live.margin.percent) : 'Elegí una categoría'}
                    </span>
                    <span className="field__hint">
                      Sale de la categoría o la subcategoría. Solo el dueño lo cambia.
                    </span>
                  </div>
                )}
              </div>

              <div className="pricebox" aria-live="polite">
                <span className="pricebox__label">Precio sugerido</span>
                <span className="pricebox__value" data-testid="suggested-price">
                  {live.suggested ? formatPrice(live.suggested) : '—'}
                </span>
                <span className="pricebox__help">
                  {live.suggested
                    ? `Costo × margen ${live.margin ? formatPercent(live.margin.percent) : ''} × IVA ${formatPercent(form.vat)}, redondeado hacia arriba.`
                    : 'Cargá el costo y elegí la categoría para ver el sugerido.'}
                </span>
              </div>

              <TextField
                label="Precio de venta (con IVA)"
                hint="Es el precio que se cobra. Viene del sugerido, pero lo confirmás vos."
                inputMode="decimal"
                value={priceText}
                error={errors.salePrice}
                onChange={(e) =>
                  setForm((p) => ({ ...p, price: e.target.value, priceTouched: true }))
                }
              />
              {losing && (
                <Notice variant="warning">
                  Con este precio vendés a pérdida: el margen real es{' '}
                  {realMargin ? formatPercent(realMargin.toFixed()) : ''}. Podés guardarlo, pero te
                  lo vamos a pedir confirmar.
                </Notice>
              )}
              {priceDiffers && live.suggested && (
                <div className="callout">
                  <p>
                    <strong>
                      Margen real con este precio:{' '}
                      {realMargin ? formatPercent(realMargin.toFixed()) : 'sin costo cargado'}
                    </strong>
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setForm((p) => ({ ...p, priceTouched: false, price: '' }))}
                  >
                    Usar el sugerido ({formatPrice(live.suggested)})
                  </Button>
                </div>
              )}
            </fieldset>
          )}

          {formError && <ErrorMessage title="No se pudo guardar" message={formError} />}
          <div className="form__actions">
            <Button type="submit" large loading={save.isPending}>
              {editing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
            <Link to={backTo} className="btn btn--secondary btn--large">
              Cancelar
            </Link>
          </div>
        </form>
      )}
      {belowCost && (
        <BelowCostDialog
          details={belowCost}
          busy={save.isPending}
          onReview={() => setBelowCost(null)}
          onConfirm={() => save.mutate(true)}
        />
      )}
    </div>
  );
}
