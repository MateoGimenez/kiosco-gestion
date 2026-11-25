// Líneas de la venta. Se arma de arriba hacia abajo; la última agregada queda elegida.
import { formatMoney, formatQuantity, lineSubtotal } from '@kiosco/shared';
import { Button } from '../Button';
import { exceedsStock, isZeroLine, type CartLine } from '../../lib/sales/cart';

interface CartProps {
  lines: readonly CartLine[];
  selectedKey: number | null;
  onSelect: (key: number) => void;
  onEditQuantity: (line: CartLine) => void;
  onStep: (line: CartLine, delta: 1 | -1) => void;
  onRemove: (line: CartLine) => void;
}

export function Cart({
  lines,
  selectedKey,
  onSelect,
  onEditQuantity,
  onStep,
  onRemove,
}: CartProps) {
  if (lines.length === 0) {
    return (
      <div className="cart-empty">
        <p className="cart-empty__title">Todavía no hay productos</p>
        <p>Escaneá un código de barras o escribí el nombre del producto en el buscador.</p>
      </div>
    );
  }
  return (
    <table className="cart">
      <caption className="sr-only">Productos de la venta</caption>
      <thead>
        <tr>
          <th scope="col">Producto</th>
          <th scope="col">Cantidad</th>
          <th scope="col" className="cart__num cart__price">
            Precio
          </th>
          <th scope="col" className="cart__num">
            Importe
          </th>
          <th scope="col">
            <span className="sr-only">Quitar</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const isKg = line.saleUnit === 'KG';
          const zero = isZeroLine(line);
          const stock = exceedsStock(line);
          const label =
            line.isMiscellaneous && line.description
              ? `${line.name}: ${line.description}`
              : line.name;
          return (
            <tr
              key={line.key}
              className={[
                'cart__row',
                line.key === selectedKey ? 'is-selected' : '',
                line.unavailable ? 'is-unavailable' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={line.key === selectedKey ? 'true' : undefined}
              onClick={() => onSelect(line.key)}
            >
              <th scope="row" className="cart__product">
                <span className="cart__name">{label}</span>
                {line.unavailable && (
                  <span className="cart__flag cart__flag--bad">
                    Este producto se desactivó: quitalo para cobrar.
                  </span>
                )}
                {zero && !line.unavailable && (
                  <span className="cart__flag cart__flag--bad">
                    Esta línea da $ 0. Corregí la cantidad o quitala.
                  </span>
                )}
                {stock && !line.unavailable && (
                  <span className="cart__flag cart__flag--warn">
                    Stock insuficiente (hay{' '}
                    {formatQuantity(line.stockQuantity ?? '0', line.saleUnit)}). Se puede vender
                    igual.
                  </span>
                )}
              </th>
              <td className="cart__qty">
                {isKg ? (
                  <button
                    type="button"
                    className="cart__qtybtn"
                    onClick={() => onEditQuantity(line)}
                    aria-label={`Cambiar los kilos de ${label}`}
                  >
                    {formatQuantity(line.quantity, 'KG')}
                  </button>
                ) : (
                  <span className="stepper">
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Una unidad menos de ${label}`}
                      disabled={line.isMiscellaneous || Number(line.quantity) <= 1}
                      onClick={() => onStep(line, -1)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="stepper__value"
                      aria-label={`Cantidad de ${label}: ${line.quantity}. Cambiar`}
                      onClick={() => onEditQuantity(line)}
                    >
                      {formatQuantity(line.quantity)}
                    </button>
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Una unidad más de ${label}`}
                      onClick={() => onStep(line, 1)}
                    >
                      +
                    </button>
                  </span>
                )}
              </td>
              <td className="cart__num cart__price">{formatMoney(line.unitPrice)}</td>
              <td className="cart__num cart__amount">
                {formatMoney(lineSubtotal(line.quantity, line.unitPrice))}
              </td>
              <td className="cart__remove">
                <Button
                  variant="secondary"
                  onClick={() => onRemove(line)}
                  aria-label={`Quitar ${label}`}
                >
                  Quitar
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
