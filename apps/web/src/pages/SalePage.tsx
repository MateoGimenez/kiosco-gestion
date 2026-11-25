// Pantalla de venta: el corazón del sistema. Se usa todo el día con el lector de códigos y el teclado.
// El foco vive siempre en el buscador y vuelve solo después de cada acción.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, newClientRequestId, type ProductSaleItem } from '@kiosco/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { Cart } from '../components/sales/Cart';
import { CheckoutDialog } from '../components/sales/CheckoutDialog';
import { DiscountDialog } from '../components/sales/DiscountDialog';
import { MiscDialog } from '../components/sales/MiscDialog';
import { OpenCashForm } from '../components/sales/OpenCashForm';
import { ProductSearchBox } from '../components/sales/ProductSearchBox';
import { QuantityDialog } from '../components/sales/QuantityDialog';
import { SaleSummary } from '../components/sales/SaleSummary';
import { useAuth } from '../lib/auth-context';
import { keys as catalogKeys } from '../lib/catalog/api';
import { isManagerOrOwner, useIsRemote, useRole } from '../lib/useRole';
import { salesApi, salesKeys } from '../lib/sales/api';
import {
  EMPTY_CART,
  cartReducer,
  computeCart,
  isZeroLine,
  type CartDiscount,
  type CartLine,
} from '../lib/sales/cart';
import { SHORTCUTS } from '../lib/sales/shortcuts';
import { SHIFT_LABELS, formatTime } from '../lib/sales/labels';
import {
  hasOpeningCash,
  type CreateSaleResponse,
  type TotalChangedDetails,
} from '../lib/sales/types';

type DialogState =
  | { kind: 'weight'; product: ProductSaleItem }
  | { kind: 'quantity'; line: CartLine }
  | { kind: 'misc' }
  | { kind: 'discount' }
  | { kind: 'checkout' }
  | { kind: 'clear' };

export function SalePage() {
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const role = useRole();
  const remote = useIsRemote();
  const me = state.status === 'authenticated' ? state.session.user : null;
  const canDiscount = isManagerOrOwner(role);

  const cash = useQuery({
    queryKey: salesKeys.currentCash,
    queryFn: ({ signal }) => salesApi.currentCash(signal),
  });
  const methods = useQuery({
    queryKey: salesKeys.paymentMethods,
    queryFn: ({ signal }) => salesApi.paymentMethods(signal),
  });
  const hasCashSession = Boolean(cash.data?.cashSession);
  const misc = useQuery({
    queryKey: salesKeys.miscellaneous,
    queryFn: ({ signal }) => salesApi.miscellaneous(signal),
    enabled: hasCashSession,
  });

  const [cart, dispatch] = useReducer(cartReducer, EMPTY_CART);
  const [discount, setDiscount] = useState<CartDiscount | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [summary, setSummary] = useState<CreateSaleResponse | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // Un identificador por carrito: se renueva solo al cobrar o al vaciar (ventas.md 2.4).
  const clientRequestId = useRef(newClientRequestId());
  const searchRef = useRef<HTMLInputElement>(null);

  const focusSearch = useCallback(() => {
    // Un instante después: deja que el diálogo termine de cerrarse y devuelva el foco.
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  // El foco vuelve al buscador cuando se cierra un diálogo y cuando aparece la pantalla de venta.
  const dialogOpen = dialog !== null;
  useEffect(() => {
    if (!dialogOpen && hasCashSession && !remote) focusSearch();
  }, [dialogOpen, hasCashSession, remote, focusSearch]);

  const discountInput = discount ? { type: discount.type, value: discount.value } : null;
  const totals = computeCart(cart.lines, discountInput);
  const calc = totals.calc;

  const activeMethods = (methods.data?.items ?? []).filter((m) => m.isActive);
  const blockReason = (() => {
    if (cart.lines.length === 0) return null;
    if (cart.lines.some((l) => l.unavailable))
      return 'Hay productos desactivados: quitalos para cobrar.';
    if (cart.lines.some(isZeroLine))
      return 'Hay una línea en $ 0: corregila o quitala para cobrar.';
    if (!totals.ok) return calcMessage(totals.code);
    if (methods.isError || (methods.isSuccess && activeMethods.length === 0))
      return 'No se pudieron cargar los medios de pago.';
    return null;
  })();

  function addProduct(product: ProductSaleItem) {
    setSummary(null);
    setHint(null);
    if (product.isMiscellaneous) {
      setDialog({ kind: 'misc' });
    } else if (product.saleUnit === 'KG') {
      setDialog({ kind: 'weight', product });
    } else {
      dispatch({ type: 'add', product, quantity: '1', mode: 'sum' });
    }
  }

  function openMisc() {
    if (misc.isError) {
      setHint('No se pudo cargar "Varios". Probá de nuevo en un momento.');
      void misc.refetch();
      return;
    }
    if (!misc.data) return;
    setSummary(null);
    setDialog({ kind: 'misc' });
  }

  function startCheckout() {
    if (remote) return;
    if (cart.lines.length === 0) return setHint('Agregá al menos un producto para cobrar.');
    if (blockReason) return setHint(blockReason);
    setHint(null);
    setDialog({ kind: 'checkout' });
  }

  function editSelectedQuantity() {
    const line = cart.lines.find((l) => l.key === cart.selectedKey);
    if (line && !line.isMiscellaneous) setDialog({ kind: 'quantity', line });
  }

  function removeSelected() {
    if (cart.selectedKey !== null) dispatch({ type: 'remove', key: cart.selectedKey });
  }

  function resetCart() {
    dispatch({ type: 'clear' });
    setDiscount(null);
    clientRequestId.current = newClientRequestId();
  }

  // Atajos de teclado y recuperación del foco para el lector.
  useEffect(() => {
    if (!hasCashSession || remote) return;
    function onKeyDown(event: KeyboardEvent) {
      if (dialogOpen) return;
      const target = event.target as HTMLElement | null;
      const inSearch = target === searchRef.current;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (event.key === 'F3') {
        event.preventDefault();
        editSelectedQuantity();
      } else if (event.key === 'F4') {
        event.preventDefault();
        openMisc();
      } else if (event.key === 'F8') {
        event.preventDefault();
        if (canDiscount && cart.lines.length > 0) setDialog({ kind: 'discount' });
      } else if (event.key === 'F9') {
        event.preventDefault();
        if (cart.lines.length > 0) setDialog({ kind: 'clear' });
      } else if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        startCheckout();
      } else if (event.key === 'Delete' && (inSearch ? searchRef.current?.value === '' : !typing)) {
        event.preventDefault();
        removeSelected();
      } else if (
        !typing &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.length === 1
      ) {
        // Se escribió algo sin tener el foco en un campo (por ejemplo el lector): va al buscador.
        const interactive = target?.closest('button, a, [role="button"]');
        if (!interactive) searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function handleSold(response: CreateSaleResponse) {
    resetCart();
    setSummary(response);
    setDialog(null);
    // El stock cambió: las listas de productos y de reposición ya no valen.
    void queryClient.invalidateQueries({ queryKey: catalogKeys.products });
    void queryClient.invalidateQueries({ queryKey: catalogKeys.stockLists });
  }

  async function handleTotalChanged(details: TotalChangedDetails) {
    const prices = details.items.flatMap((item) => {
      const line = cart.lines[item.index];
      return line ? [{ productId: line.productId, unitPrice: item.unitPrice }] : [];
    });
    dispatch({ type: 'reprice', prices });
    await queryClient.refetchQueries({ queryKey: salesKeys.paymentMethods });
  }

  function handleUnavailable(productIds: number[]) {
    dispatch({ type: 'markUnavailable', productIds });
    const names = cart.lines.filter((l) => productIds.includes(l.productId)).map((l) => l.name);
    setHint(
      names.length > 0
        ? `Se desactivó: ${names.join(', ')}. Quitalo del carrito para cobrar.`
        : 'Un producto se desactivó. Quitalo del carrito para cobrar.',
    );
    setDialog(null);
  }

  // --- Estados de la pantalla -------------------------------------------------------------
  if (cash.isPending) {
    return (
      <div className="page">
        <h1>Vender</h1>
        <LoadingState label="Cargando la caja…" />
      </div>
    );
  }
  if (cash.isError) {
    return (
      <div className="page">
        <h1>Vender</h1>
        <ErrorMessage
          title="No se pudo cargar la caja"
          error={cash.error}
          onRetry={() => void cash.refetch()}
        />
      </div>
    );
  }

  const session = cash.data.cashSession;
  if (remote) {
    return (
      <div className="page">
        <h1>Vender</h1>
        <div className="panel">
          <h2>Solo desde el local</h2>
          <p>
            Vender y abrir la caja se hace únicamente desde la computadora o la tablet del local.
            Desde acá podés consultar las ventas.
          </p>
          <Button large disabled>
            Vender: solo desde el local
          </Button>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="page">
        <h1>Vender</h1>
        <OpenCashForm remote={remote} />
        {cart.lines.length > 0 && (
          <Notice variant="info">
            Tu carrito quedó guardado ({cart.lines.length}{' '}
            {cart.lines.length === 1 ? 'producto' : 'productos'}). Abrí la caja para cobrarlo.
          </Notice>
        )}
      </div>
    );
  }

  const otherOpened = me !== null && session.openedBy.id !== me.id;
  const staleDay = session.businessDate < cash.data.currentBusinessDate;
  const selectedLine = cart.lines.find((l) => l.key === cart.selectedKey);

  return (
    <div className="sale">
      <div className="sale__main">
        <div className="sale__head">
          <h1>Vender</h1>
          <p className="sale__cash">
            Caja abierta · turno {SHIFT_LABELS[session.shift].toLowerCase()} ·{' '}
            {session.openedBy.fullName}, {formatTime(session.openedAt)}
            {hasOpeningCash(session) && <> · inicial {formatMoney(session.openingCash)}</>}
          </p>
        </div>
        {otherOpened && (
          <Notice variant="info">
            Esta caja la abrió {session.openedBy.fullName}. Estás vendiendo en esa caja.
          </Notice>
        )}
        {staleDay && (
          <Notice variant="warning">
            Esta caja quedó abierta de un día anterior. Avisale al encargado para que la cierre.
          </Notice>
        )}
        {summary && (
          <SaleSummary
            result={summary}
            onClose={() => {
              setSummary(null);
              focusSearch();
            }}
          />
        )}
        <ProductSearchBox
          inputRef={searchRef}
          onPick={addProduct}
          onMoveSelection={(delta) => dispatch({ type: 'moveSelection', delta })}
        />
        {hint && <Notice variant="warning">{hint}</Notice>}
        {methods.isError && (
          <ErrorMessage
            title="No se pudieron cargar los medios de pago"
            error={methods.error}
            onRetry={() => void methods.refetch()}
          />
        )}
        <Cart
          lines={cart.lines}
          selectedKey={cart.selectedKey}
          onSelect={(key) => dispatch({ type: 'select', key })}
          onEditQuantity={(line) => setDialog({ kind: 'quantity', line })}
          onStep={(line, delta) =>
            dispatch({
              type: 'setQuantity',
              key: line.key,
              quantity: String(Math.max(1, Number(line.quantity) + delta)),
            })
          }
          onRemove={(line) => {
            dispatch({ type: 'remove', key: line.key });
            focusSearch();
          }}
        />
      </div>

      <aside className="sale__side" aria-label="Total y cobro">
        <div className="totalbox">
          <span className="totalbox__label">Total</span>
          <output className="totalbox__value" aria-live="polite">
            {formatMoney(calc.amountDue)}
          </output>
          {(!calc.discountAmount.isZero() || discount) && (
            <dl className="totalbox__rows">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(calc.subtotal)}</dd>
              </div>
              <div>
                <dt>
                  Descuento
                  {discount?.type === 'PERCENT' ? ` ${discount.value.replace('.', ',')} %` : ''}
                </dt>
                <dd>−{formatMoney(calc.discountAmount)}</dd>
              </div>
            </dl>
          )}
          {!totals.ok && (
            <p className="totalbox__block" role="alert">
              {calcMessage(totals.code)}
            </p>
          )}
          {blockReason && totals.ok && <p className="totalbox__block">{blockReason}</p>}
          <Button
            large
            className="totalbox__pay"
            disabled={cart.lines.length === 0 || methods.isPending}
            onClick={startCheckout}
          >
            Cobrar <kbd>{SHORTCUTS.pay}</kbd>
          </Button>
          {discount && canDiscount && (
            <p className="totalbox__note">
              Descuento aplicado{discount.reason ? `: ${discount.reason}` : ''}.{' '}
              <button type="button" className="linklike" onClick={() => setDiscount(null)}>
                Sacar
              </button>
            </p>
          )}
        </div>

        <section className="shortcuts" aria-label="Atajos de teclado">
          <h2 className="shortcuts__title">Atajos</h2>
          <ul className="shortcuts__list">
            <li>
              <button
                type="button"
                onClick={() => {
                  searchRef.current?.focus();
                }}
              >
                Buscar <kbd>{SHORTCUTS.search}</kbd>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={editSelectedQuantity}
                disabled={!selectedLine || selectedLine.isMiscellaneous}
              >
                Cambiar cantidad <kbd>{SHORTCUTS.quantity}</kbd>
              </button>
            </li>
            <li>
              <button type="button" onClick={openMisc} disabled={!misc.data}>
                Varios <kbd>{SHORTCUTS.misc}</kbd>
              </button>
            </li>
            {canDiscount && (
              <li>
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'discount' })}
                  disabled={cart.lines.length === 0}
                >
                  Descuento <kbd>{SHORTCUTS.discount}</kbd>
                </button>
              </li>
            )}
            <li>
              <button type="button" onClick={removeSelected} disabled={!selectedLine}>
                Quitar línea <kbd>{SHORTCUTS.remove}</kbd>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setDialog({ kind: 'clear' })}
                disabled={cart.lines.length === 0}
              >
                Vaciar carrito <kbd>{SHORTCUTS.clear}</kbd>
              </button>
            </li>
          </ul>
          <p className="shortcuts__note">
            Con el lector, escaneá el código y el producto se agrega solo. Flechas ↑ ↓ para elegir
            una línea.
          </p>
        </section>
      </aside>

      {dialog?.kind === 'weight' && (
        <QuantityDialog
          productName={dialog.product.name}
          unit="KG"
          unitPrice={dialog.product.salePrice}
          initial={cart.lines.find((l) => l.productId === dialog.product.id)?.quantity ?? ''}
          onCancel={() => setDialog(null)}
          onSubmit={(quantity) => {
            dispatch({ type: 'add', product: dialog.product, quantity, mode: 'set' });
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'quantity' && (
        <QuantityDialog
          productName={dialog.line.name}
          unit={dialog.line.saleUnit}
          unitPrice={dialog.line.unitPrice}
          initial={dialog.line.quantity}
          onCancel={() => setDialog(null)}
          onSubmit={(quantity) => {
            dispatch({ type: 'setQuantity', key: dialog.line.key, quantity });
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'misc' && misc.data && (
        <MiscDialog
          onCancel={() => setDialog(null)}
          onSubmit={(unitPrice, description) => {
            dispatch({ type: 'addMisc', product: misc.data, unitPrice, description });
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'discount' && canDiscount && (
        <DiscountDialog
          current={discount}
          onCancel={() => setDialog(null)}
          onSubmit={(next) => {
            setDiscount(next);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'clear' && (
        <ConfirmDialog
          title="Vaciar el carrito"
          confirmLabel="Sí, vaciar"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            resetCart();
            setDialog(null);
          }}
        >
          <p>Se van a sacar todos los productos de esta venta. Esto no se puede deshacer.</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'checkout' && (
        <CheckoutDialog
          lines={cart.lines}
          discount={discount}
          methods={activeMethods}
          getClientRequestId={() => clientRequestId.current}
          onClose={() => setDialog(null)}
          onSold={handleSold}
          onTotalChanged={handleTotalChanged}
          onUnavailable={handleUnavailable}
          onAlreadySold={() => {
            resetCart();
            setDialog(null);
          }}
          onCashSessionMissing={() => {
            setDialog(null);
            void queryClient.invalidateQueries({ queryKey: salesKeys.currentCash });
          }}
        />
      )}
    </div>
  );
}

function calcMessage(
  code: 'LINE_TOTAL_ZERO' | 'DISCOUNT_TOO_HIGH' | 'DISCOUNT_ROUNDS_TO_ZERO',
): string {
  switch (code) {
    case 'LINE_TOTAL_ZERO':
      return 'Una línea da $ 0. Revisá el precio o la cantidad.';
    case 'DISCOUNT_TOO_HIGH':
      return 'El descuento tiene que ser menor que el subtotal. Cambialo o sacalo.';
    case 'DISCOUNT_ROUNDS_TO_ZERO':
      return 'El descuento es tan chico que da $ 0. Cambialo o sacalo.';
  }
}
