// Precios de un producto: costo, margen, sugerido vs precio actual. Encargado y dueño.
// Cambiar el costo o el margen NO cambia el precio de venta: lo decide la persona (D7).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal, formatMoneyWithCents, formatPercent } from '@kiosco/shared';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { TextField } from '../components/TextField';
import { ApiError } from '../lib/api';
import { serverErrorToFields } from '../lib/formErrors';
import { catalogApi, keys } from '../lib/catalog/api';
import { toApiNumber, toInputText } from '../lib/catalog/decimalInput';
import {
  chooseMargin,
  finalFromNet,
  formatPrice,
  liveRealMargin,
  liveSuggestedPrice,
  netFromFinal,
} from '../lib/catalog/pricing';
import type { ProductPricing, UpdatePricingRequest } from '../lib/catalog/types';
import { checkMoney, checkPercent } from '../lib/catalog/validation';
import { useRole } from '../lib/useRole';

const SOURCE_LABELS = {
  PRODUCT: 'propio del producto',
  SUBCATEGORY: 'de la subcategoría',
  CATEGORY: 'de la categoría',
} as const;

export function PricingDetailPage() {
  const { id } = useParams();
  const productId = Number(id);
  const pricing = useQuery({
    queryKey: keys.pricing(productId),
    queryFn: ({ signal }) => catalogApi.pricing(productId, signal),
    enabled: Number.isInteger(productId) && productId > 0,
  });

  if (pricing.isPending) return <LoadingState label="Cargando precios…" />;
  if (pricing.isError) {
    const notFound = pricing.error instanceof ApiError && pricing.error.status === 404;
    return (
      <div className="page">
        <Link to="/pricing" className="back-link">
          ‹ Volver a Precios
        </Link>
        <ErrorMessage
          title={notFound ? 'No encontramos ese producto' : 'No se pudieron cargar los precios'}
          error={pricing.error}
          {...(notFound ? {} : { onRetry: () => void pricing.refetch() })}
        />
      </div>
    );
  }
  // La key reinicia el formulario cuando el servidor devuelve datos nuevos.
  return <PricingEditor key={pricing.data.updatedAt} pricing={pricing.data} />;
}

type CostMode = 'NET' | 'FINAL';

function PricingEditor({ pricing }: { pricing: ProductPricing }) {
  const isOwner = useRole() === 'OWNER';
  const queryClient = useQueryClient();
  const vat = pricing.vatRatePercent;

  const [costMode, setCostMode] = useState<CostMode>('NET');
  const [netText, setNetText] = useState(toInputText(pricing.netCostPrice));
  const [finalText, setFinalText] = useState(toInputText(pricing.costPrice));
  const [marginText, setMarginText] = useState(toInputText(pricing.marginPercent));
  const [priceText, setPriceText] = useState(toInputText(pricing.salePrice));
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Costo sin IVA que se va a guardar, venga cargado sin IVA o con IVA.
  const costCheck =
    costMode === 'NET'
      ? checkMoney(netText, 'El costo')
      : checkMoney(finalText, 'El costo con IVA');
  const net: Decimal | null =
    costCheck.value === null
      ? null
      : costMode === 'NET'
        ? costCheck.value
        : netFromFinal(costCheck.value, vat);
  const marginCheck = isOwner ? checkPercent(marginText, 'El margen') : { value: null };
  const priceCheck = checkMoney(priceText, 'El precio');

  const ownMargin = isOwner
    ? marginCheck.value === null
      ? null
      : toApiNumber(marginCheck.value)
    : pricing.marginPercent;
  const margin = chooseMargin(
    ownMargin,
    pricing.subcategoryMarginPercent,
    pricing.categoryMarginPercent,
  );
  const suggested = useMemo(
    () => liveSuggestedPrice(net, margin.percent, vat, pricing.priceRoundingStep),
    [net, margin.percent, vat, pricing.priceRoundingStep],
  );
  const realMargin = liveRealMargin(priceCheck.value, net, vat);
  const savedPrice = new Decimal(pricing.salePrice);

  // Qué cambió respecto de lo guardado: solo eso se manda.
  const changes: UpdatePricingRequest = {};
  if (net !== null && !net.equals(pricing.netCostPrice)) changes.netCostPrice = toApiNumber(net);
  // Solo el dueño manda el margen (el servidor responde 403 si lo manda el encargado).
  if (isOwner) {
    const before = pricing.marginPercent === null ? null : new Decimal(pricing.marginPercent);
    const after = marginCheck.value;
    const marginChanged =
      (before === null) !== (after === null) ||
      (before !== null && after !== null && !before.equals(after));
    if (marginChanged) changes.marginPercent = after === null ? null : toApiNumber(after);
  }
  if (priceCheck.value !== null && !priceCheck.value.equals(savedPrice)) {
    changes.salePrice = toApiNumber(priceCheck.value);
  }
  const fieldError = costCheck.error ?? marginCheck.error ?? priceCheck.error;
  const hasChanges = Object.keys(changes).length > 0;
  const costOrMarginOnly = hasChanges && changes.salePrice === undefined;

  const save = useMutation({
    mutationFn: () => catalogApi.updatePricing(pricing.productId, changes),
    onSuccess: async (data) => {
      queryClient.setQueryData(keys.pricing(pricing.productId), data);
      await queryClient.invalidateQueries({ queryKey: keys.products });
      setSaved('Se guardó. Cada cambio queda registrado en el historial de precios.');
    },
    onError: (error) =>
      setFormError(serverErrorToFields(error, ['salePrice'] as const).form ?? null),
  });

  function applySuggested() {
    if (suggested) setPriceText(toInputText(suggested.toFixed()));
  }

  function switchMode(next: CostMode) {
    if (next === costMode) return;
    // Se pasa lo escrito al otro modo para no perder el dato.
    if (next === 'FINAL' && net) setFinalText(toInputText(finalFromNet(net, vat).toFixed()));
    if (next === 'NET' && costCheck.value) setNetText(toInputText(net?.toFixed()));
    setCostMode(next);
  }

  if (pricing.isMiscellaneous) {
    return (
      <div className="page">
        <Link to="/pricing" className="back-link">
          ‹ Volver a Precios
        </Link>
        <h1>{pricing.name}</h1>
        <Notice variant="info">
          "Varios" no tiene costo ni precio guardado: el precio se escribe en cada venta.
        </Notice>
      </div>
    );
  }

  const differsFromSaved = suggested !== null && !suggested.equals(savedPrice);

  return (
    <div className="page">
      <Link to="/pricing" className="back-link">
        ‹ Volver a Precios
      </Link>
      <div className="page__header">
        <h1>{pricing.name}</h1>
        <div className="page__actions">
          <Link to={`/productos/${pricing.productId}`} className="btn btn--secondary">
            Ver ficha
          </Link>
        </div>
      </div>

      {saved && <Notice variant="success">{saved}</Notice>}

      <form
        className="form form--wide"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          setSaved(null);
          if (!fieldError && hasChanges) save.mutate();
        }}
      >
        <fieldset className="fieldset">
          <legend>Costo</legend>
          <div className="segmented" role="radiogroup" aria-label="Cómo cargás el costo">
            <label className={`segmented__item${costMode === 'NET' ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="cost-mode"
                checked={costMode === 'NET'}
                onChange={() => switchMode('NET')}
              />
              Sin IVA (neto)
            </label>
            <label className={`segmented__item${costMode === 'FINAL' ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="cost-mode"
                checked={costMode === 'FINAL'}
                onChange={() => switchMode('FINAL')}
              />
              Con IVA {formatPercent(vat)} (final)
            </label>
          </div>
          {costMode === 'NET' ? (
            <TextField
              label="Costo sin IVA"
              inputMode="decimal"
              value={netText}
              error={costCheck.error}
              onChange={(e) => setNetText(e.target.value)}
            />
          ) : (
            <TextField
              label="Costo con IVA"
              hint={`Se le saca el IVA del producto (${formatPercent(vat)}) para guardar el costo sin IVA.`}
              inputMode="decimal"
              value={finalText}
              error={costCheck.error}
              onChange={(e) => setFinalText(e.target.value)}
            />
          )}
          {net && (
            <p className="page__sub">
              Sin IVA: {formatMoneyWithCents(net)} · Con IVA:{' '}
              {formatMoneyWithCents(finalFromNet(net, vat))}
            </p>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend>Margen</legend>
          <p>
            Se usa <strong>{formatPercent(margin.percent)}</strong> ({SOURCE_LABELS[margin.source]}
            ).
          </p>
          {isOwner ? (
            <TextField
              label="Margen propio de este producto"
              hint="Dejalo vacío para usar el de la subcategoría o la categoría."
              inputMode="decimal"
              value={marginText}
              placeholder="%"
              error={marginCheck.error}
              onChange={(e) => setMarginText(e.target.value)}
            />
          ) : (
            <p className="page__note">Solo el dueño cambia los márgenes.</p>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend>Precio de venta</legend>
          <div className="compare">
            <div className="compare__item">
              <span className="compare__label">Precio actual</span>
              <span className="compare__value">{formatPrice(savedPrice)}</span>
            </div>
            <div className="compare__item compare__item--hint">
              <span className="compare__label">Precio sugerido</span>
              <span className="compare__value" data-testid="suggested-price">
                {suggested ? formatPrice(suggested) : '—'}
              </span>
              {!suggested && <span className="compare__note">Cargá un costo mayor a cero.</span>}
              {suggested && !differsFromSaved && (
                <span className="compare__note">Es igual al actual.</span>
              )}
            </div>
          </div>
          {differsFromSaved && suggested && (
            <div>
              <Button variant="secondary" onClick={applySuggested}>
                Aplicar el sugerido ({formatPrice(suggested)})
              </Button>
            </div>
          )}
          <TextField
            label="Precio de venta (con IVA)"
            hint="Podés aplicar el sugerido o escribir uno a mano."
            inputMode="decimal"
            value={priceText}
            error={priceCheck.error}
            onChange={(e) => setPriceText(e.target.value)}
          />
          <p className="page__sub" aria-live="polite">
            Margen real con este precio:{' '}
            <strong>
              {realMargin ? formatPercent(realMargin.toFixed()) : 'sin costo cargado'}
            </strong>
          </p>
        </fieldset>

        {costOrMarginOnly && (
          <Notice variant="info">
            Cambiar el costo o el margen no cambia el precio de venta. Si querés que cambie, aplicá
            el sugerido o escribí uno nuevo.
          </Notice>
        )}
        {formError && <ErrorMessage title="No se pudo guardar" message={formError} />}
        <div className="form__actions">
          <Button
            type="submit"
            large
            loading={save.isPending}
            disabled={!hasChanges || !!fieldError}
          >
            {hasChanges ? 'Guardar cambios' : 'Sin cambios para guardar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
