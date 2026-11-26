// Buscador del mostrador. Lo usan el lector de códigos (código + Enter) y el teclado (nombre + Enter).
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { formatMoney, formatQuantity, type ProductSaleItem } from '@kiosco/shared';
import { catalogApi } from '../../lib/catalog/api';
import { friendlyMessage } from '../../lib/apiMessages';

interface ProductSearchBoxProps {
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  onPick: (product: ProductSaleItem) => void;
  /** Flechas arriba/abajo con el buscador vacío: mover la línea elegida del carrito. */
  onMoveSelection?: (delta: 1 | -1) => void;
  /** Textos propios (por ejemplo, la carga de compras). Sin esto, los del mostrador. */
  label?: string;
  placeholder?: string;
  /** Qué decir si el código es de un producto desactivado. */
  inactiveMessage?: (query: string) => string;
  /** Mostrar el precio de venta en los resultados (en compras no hace falta). */
  showPrice?: boolean;
}

interface Results {
  query: string;
  items: ProductSaleItem[];
}

export function ProductSearchBox({
  inputRef,
  disabled = false,
  onPick,
  onMoveSelection,
  label = 'Código de barras o nombre del producto',
  placeholder = 'Escaneá el código o escribí el nombre y apretá Enter',
  inactiveMessage = (query) => `El código ${query} es de un producto desactivado: no se puede vender.`,
  showPrice = true,
}: ProductSearchBoxProps) {
  const listId = useId();
  const [value, setValue] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  // Solo vale la última búsqueda por nombre (si el lector manda otro código en el medio).
  const lastSearch = useRef(0);

  async function run(query: string) {
    const id = ++lastSearch.current;
    setBusy(true);
    setMessage(null);
    try {
      const response = await catalogApi.search(query);
      if (id !== lastSearch.current) {
        // Otra búsqueda salió después. Un código exacto igual se agrega: no se pierde una lectura.
        if (response.matchedBy === 'BARCODE' && response.items[0]) onPick(response.items[0]);
        return;
      }
      if (response.matchedBy === 'BARCODE' && response.items[0]) {
        onPick(response.items[0]);
        setResults(null);
      } else if (response.isInactiveBarcode) {
        setMessage({
          tone: 'error',
          text: inactiveMessage(query),
        });
      } else if (response.items.length === 0) {
        setMessage({
          tone: 'info',
          text: `No encontramos «${query}». Probá con otra palabra o con el código.`,
        });
      } else {
        setResults({ query, items: response.items });
        setActive(0);
      }
    } catch (error) {
      if (id === lastSearch.current) {
        setMessage({ tone: 'error', text: friendlyMessage(error) });
      }
    } finally {
      if (id === lastSearch.current) setBusy(false);
    }
  }

  function pick(product: ProductSaleItem) {
    setResults(null);
    setMessage(null);
    onPick(product);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Ctrl+Enter y las teclas F las maneja la pantalla (cobrar, atajos).
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (results) {
        const product = results.items[active];
        if (product) pick(product);
        return;
      }
      const query = value.trim();
      if (query === '' || disabled) return;
      // Se vacía enseguida: el lector ya puede mandar el código siguiente.
      setValue('');
      void run(query);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      if (results) {
        event.preventDefault();
        setActive((a) => (a + delta + results.items.length) % results.items.length);
      } else if (value === '') {
        event.preventDefault();
        onMoveSelection?.(delta);
      }
    } else if (event.key === 'Escape') {
      if (results || value !== '' || message) {
        event.preventDefault();
        event.stopPropagation();
        setResults(null);
        setValue('');
        setMessage(null);
      }
    }
  }

  const open = results !== null;
  return (
    <div className="finder">
      <label className="finder__label" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <div className="finder__box">
        <input
          ref={inputRef}
          id={`${listId}-input`}
          className="finder__input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-opt-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResults(null);
            setMessage(null);
          }}
          onKeyDown={onKeyDown}
        />
        {busy && <span className="spinner finder__spinner" aria-hidden="true" />}
        {open && (
          <ul id={listId} role="listbox" className="finder__list" aria-label="Resultados">
            {results.items.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                className={`finder__option${index === active ? ' is-active' : ''}`}
                // mousedown y no click: así el buscador no pierde el foco antes de elegir.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
              >
                <span className="finder__name">{item.name}</span>
                <span className="finder__meta">
                  {item.saleUnit === 'KG' ? 'Por kg · ' : ''}
                  {Number(item.stockQuantity) <= 0
                    ? 'Sin stock'
                    : `Stock: ${formatQuantity(item.stockQuantity, item.saleUnit)}`}
                </span>
                {showPrice && <span className="finder__price">{formatMoney(item.salePrice)}</span>}
              </li>
            ))}
            <li className="finder__hint" aria-hidden="true">
              Flechas para elegir, Enter para agregar, Esc para cancelar
            </li>
          </ul>
        )}
      </div>
      <div aria-live="polite" className="finder__status">
        {busy && <span className="sr-only">Buscando…</span>}
        {message && (
          <p
            className={message.tone === 'error' ? 'finder__msg finder__msg--error' : 'finder__msg'}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
