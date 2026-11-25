import { Button } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

/** "Mostrando 1 a 25 de 140" con Anterior y Siguiente. No se dibuja si entra todo en una página. */
export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.ceil(total / pageSize);
  return (
    <nav className="pagination" aria-label="Páginas">
      <p className="pagination__info">
        Mostrando {from} a {to} de {total}
      </p>
      <div className="pagination__buttons">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
