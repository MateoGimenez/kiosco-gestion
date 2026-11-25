// Categorías y subcategorías (encargado y dueño).
// El encargado crea categorías con su margen inicial (H-23); después solo el dueño cambia márgenes.
import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPercent } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormDialog } from '../components/FormDialog';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { TextField } from '../components/TextField';
import { ApiError } from '../lib/api';
import { friendlyMessage } from '../lib/apiMessages';
import { catalogApi, keys } from '../lib/catalog/api';
import { toApiNumber, toInputText } from '../lib/catalog/decimalInput';
import type { Category, Subcategory } from '../lib/catalog/types';
import { checkPercent } from '../lib/catalog/validation';
import { useRole } from '../lib/useRole';

/** La subcategoría "Varios" no se desactiva: la API la marca con `hasMiscellaneousProduct`. */
function isMiscSubcategory(sub: Subcategory): boolean {
  return sub.hasMiscellaneousProduct === true;
}

type DialogState =
  | { kind: 'newCategory' }
  | { kind: 'editCategory'; category: Category }
  | { kind: 'newSub'; category: Category }
  | { kind: 'editSub'; category: Category; sub: Subcategory }
  | { kind: 'deactivate'; category: Category; sub?: Subcategory };

export function CategoriesPage() {
  const isOwner = useRole() === 'OWNER';
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: keys.categories,
    queryFn: ({ signal }) => catalogApi.categories(signal),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: keys.categories });
  }

  const toggle = useMutation({
    mutationFn: ({
      category,
      sub,
      isActive,
    }: {
      category: Category;
      sub?: Subcategory;
      isActive: boolean;
    }): Promise<unknown> =>
      sub
        ? catalogApi.updateSubcategory(sub.id, { isActive })
        : catalogApi.updateCategory(category.id, { isActive }),
    onSuccess: async (_d, { category, sub, isActive }) => {
      await refresh();
      setDialog(null);
      setNotice(
        `Se ${isActive ? 'reactivó' : 'desactivó'} ${sub ? 'la subcategoría' : 'la categoría'} "${sub?.name ?? category.name}".`,
      );
    },
  });

  const items = categories.data?.items ?? [];

  return (
    <div className="page">
      <div className="page__header">
        <h1>Categorías</h1>
        <div className="page__actions">
          <Button onClick={() => setDialog({ kind: 'newCategory' })}>Nueva categoría</Button>
        </div>
      </div>
      <p className="page__sub">
        Cada producto tiene una categoría y una subcategoría. El margen sirve para calcular el
        precio sugerido.
        {!isOwner && ' Los márgenes los cambia el dueño.'}
      </p>

      {notice && <Notice variant="success">{notice}</Notice>}
      {toggle.isError && !dialog && (
        <ErrorMessage title="No se pudo cambiar el estado" error={toggle.error} />
      )}

      {categories.isPending && <LoadingState label="Cargando categorías…" />}
      {categories.isError && (
        <ErrorMessage
          title="No se pudieron cargar las categorías"
          error={categories.error}
          onRetry={() => void categories.refetch()}
        />
      )}
      {categories.isSuccess && items.length === 0 && (
        <div className="empty">
          <p className="empty__title">Todavía no hay categorías.</p>
          <p>Creá la primera con "Nueva categoría" y poné su margen.</p>
        </div>
      )}

      {items.map((category) => (
        <section
          key={category.id}
          className={`catblock${category.isActive ? '' : ' catblock--inactive'}`}
          aria-labelledby={`cat-${category.id}`}
        >
          <div className="catblock__head">
            <div className="catblock__title">
              <h2 id={`cat-${category.id}`}>{category.name}</h2>
              {!category.isActive && <Badge tone="off">Desactivada</Badge>}
              <span className="page__sub">
                Margen{' '}
                {category.marginPercent !== undefined ? formatPercent(category.marginPercent) : '—'}
                {category.activeProductCount !== undefined &&
                  ` · ${category.activeProductCount} ${category.activeProductCount === 1 ? 'producto activo' : 'productos activos'}`}
              </span>
            </div>
            <div className="catblock__actions">
              <Button
                variant="secondary"
                aria-label={`Editar la categoría ${category.name}`}
                onClick={() => setDialog({ kind: 'editCategory', category })}
              >
                Editar
              </Button>
              {category.isActive ? (
                <Button
                  variant="secondary"
                  disabled={category.hasMiscellaneousProduct}
                  aria-label={`Desactivar la categoría ${category.name}`}
                  onClick={() => {
                    toggle.reset();
                    setDialog({ kind: 'deactivate', category });
                  }}
                >
                  Desactivar
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={
                    toggle.isPending &&
                    toggle.variables.category.id === category.id &&
                    !toggle.variables.sub
                  }
                  aria-label={`Reactivar la categoría ${category.name}`}
                  onClick={() => {
                    setNotice(null);
                    toggle.mutate({ category, isActive: true });
                  }}
                >
                  Reactivar
                </Button>
              )}
            </div>
          </div>

          {category.hasMiscellaneousProduct && (
            <p className="page__note">Esta categoría es la de "Varios": no se desactiva.</p>
          )}

          <ul className="sublist" aria-label={`Subcategorías de ${category.name}`}>
            {category.subcategories.length === 0 && (
              <li className="sublist__empty">Todavía no tiene subcategorías.</li>
            )}
            {category.subcategories.map((sub) => (
              <li
                key={sub.id}
                className={`sublist__row${sub.isActive ? '' : ' sublist__row--inactive'}`}
              >
                <div className="sublist__who">
                  <span className="sublist__name">{sub.name}</span>
                  {!sub.isActive && <Badge tone="off">Desactivada</Badge>}
                  <span className="plist__sub">
                    {sub.marginPercent === undefined
                      ? ''
                      : sub.marginPercent === null
                        ? 'Usa el margen de la categoría'
                        : `Margen ${formatPercent(sub.marginPercent)}`}
                    {sub.activeProductCount !== undefined && ` · ${sub.activeProductCount} activos`}
                  </span>
                  {isMiscSubcategory(sub) && (
                    <span className="plist__sub">Es la de "Varios": no se desactiva.</span>
                  )}
                </div>
                <div className="catblock__actions">
                  <Button
                    variant="secondary"
                    aria-label={`Editar la subcategoría ${sub.name}`}
                    onClick={() => setDialog({ kind: 'editSub', category, sub })}
                  >
                    Editar
                  </Button>
                  {sub.isActive ? (
                    <Button
                      variant="secondary"
                      aria-label={`Desactivar la subcategoría ${sub.name}`}
                      disabled={isMiscSubcategory(sub)}
                      onClick={() => {
                        toggle.reset();
                        setDialog({ kind: 'deactivate', category, sub });
                      }}
                    >
                      Desactivar
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      loading={toggle.isPending && toggle.variables.sub?.id === sub.id}
                      aria-label={`Reactivar la subcategoría ${sub.name}`}
                      onClick={() => {
                        setNotice(null);
                        toggle.mutate({ category, sub, isActive: true });
                      }}
                    >
                      Reactivar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {category.isActive && (
            <div>
              <Button variant="secondary" onClick={() => setDialog({ kind: 'newSub', category })}>
                Agregar subcategoría a {category.name}
              </Button>
            </div>
          )}
        </section>
      ))}

      {dialog && (dialog.kind === 'newCategory' || dialog.kind === 'editCategory') && (
        <CategoryDialog
          isOwner={isOwner}
          {...(dialog.kind === 'editCategory' ? { category: dialog.category } : {})}
          onClose={() => setDialog(null)}
          onDone={async (message) => {
            await refresh();
            setDialog(null);
            setNotice(message);
          }}
        />
      )}
      {dialog && (dialog.kind === 'newSub' || dialog.kind === 'editSub') && (
        <SubcategoryDialog
          isOwner={isOwner}
          category={dialog.category}
          {...(dialog.kind === 'editSub' ? { sub: dialog.sub } : {})}
          onClose={() => setDialog(null)}
          onDone={async (message) => {
            await refresh();
            setDialog(null);
            setNotice(message);
          }}
        />
      )}
      {dialog?.kind === 'deactivate' && (
        <ConfirmDialog
          title={`¿Desactivar ${dialog.sub ? 'la subcategoría' : 'la categoría'} ${dialog.sub?.name ?? dialog.category.name}?`}
          confirmLabel="Desactivar"
          danger
          busy={toggle.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            toggle.mutate({
              category: dialog.category,
              ...(dialog.sub ? { sub: dialog.sub } : {}),
              isActive: false,
            })
          }
        >
          <p>Deja de aparecer al cargar productos nuevos. Lo podés reactivar cuando quieras.</p>
          {toggle.isError && (
            <ActiveProductsError
              error={toggle.error}
              categoryId={dialog.category.id}
              subId={dialog.sub?.id}
            />
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Error de "tiene productos activos" (H-27): dice cuántos son y lleva a verlos. */
function ActiveProductsError({
  error,
  categoryId,
  subId,
}: {
  error: unknown;
  categoryId: number;
  subId?: number | undefined;
}) {
  const count =
    error instanceof ApiError && typeof error.details?.activeProductCount === 'number'
      ? error.details.activeProductCount
      : null;
  const blocked =
    error instanceof ApiError &&
    (error.code === 'CATEGORY_HAS_ACTIVE_PRODUCTS' ||
      error.code === 'SUBCATEGORY_HAS_ACTIVE_PRODUCTS');
  return (
    <div className="error-message" role="alert">
      <p className="error-message__title">
        {blocked ? 'No se puede desactivar todavía' : 'No se pudo completar la acción'}
      </p>
      <p>
        {blocked && count !== null
          ? `Tiene ${count} ${count === 1 ? 'producto activo' : 'productos activos'}. Movelos a otra ${subId ? 'subcategoría' : 'categoría'} o desactivalos primero.`
          : friendlyMessage(error)}
      </p>
      {blocked && (
        <Link to={`/productos?category=${categoryId}${subId ? `&subcategory=${subId}` : ''}`}>
          Ver esos productos
        </Link>
      )}
    </div>
  );
}

function CategoryDialog({
  category,
  isOwner,
  onClose,
  onDone,
}: {
  category?: Category;
  isOwner: boolean;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [margin, setMargin] = useState(toInputText(category?.marginPercent));
  const [errors, setErrors] = useState<{ name?: string; margin?: string }>({});
  // En una categoría nueva, el margen inicial lo pone quien la crea (también el encargado, H-23).
  const showMargin = !category || isOwner;

  const save = useMutation({
    mutationFn: () => {
      const marginValue = checkPercent(margin, 'El margen').value;
      if (!category) {
        return catalogApi.createCategory({
          name: name.trim(),
          marginPercent: toApiNumber(marginValue!),
        });
      }
      const body: { name?: string; marginPercent?: string } = {};
      if (name.trim() !== category.name) body.name = name.trim();
      if (isOwner && marginValue && !marginValue.equals(category.marginPercent ?? '')) {
        body.marginPercent = toApiNumber(marginValue);
      }
      return catalogApi.updateCategory(category.id, body);
    },
    onSuccess: () =>
      onDone(category ? 'Cambios guardados.' : `Se creó la categoría "${name.trim()}".`),
  });

  function submit() {
    const next: { name?: string; margin?: string } = {};
    if (name.trim() === '') next.name = 'Escribí el nombre.';
    else if (name.trim().length > 60) next.name = 'Puede tener hasta 60 caracteres.';
    if (showMargin) {
      const check = checkPercent(margin, 'El margen');
      if (check.error) next.margin = check.error;
      else if (check.value === null)
        next.margin = 'Poné el margen de la categoría (por ejemplo, 40).';
    }
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  const nameTaken = save.error instanceof ApiError && save.error.code === 'CATEGORY_NAME_TAKEN';
  return (
    <FormDialog
      title={category ? `Editar ${category.name}` : 'Nueva categoría'}
      submitLabel={category ? 'Guardar' : 'Crear categoría'}
      busy={save.isPending}
      error={save.isError && !nameTaken ? friendlyMessage(save.error) : undefined}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label="Nombre"
        value={name}
        autoFocus
        maxLength={60}
        error={errors.name ?? (nameTaken ? friendlyMessage(save.error) : undefined)}
        onChange={(e) => setName(e.target.value)}
      />
      {showMargin ? (
        <TextField
          label={category ? 'Margen (%)' : 'Margen inicial (%)'}
          hint={
            category
              ? 'Cambiarlo no cambia los precios guardados, solo el precio sugerido.'
              : isOwner
                ? 'Se usa para calcular el precio sugerido.'
                : 'Se usa para calcular el precio sugerido. Después solo el dueño lo puede cambiar.'
          }
          inputMode="decimal"
          value={margin}
          error={errors.margin}
          onChange={(e) => setMargin(e.target.value)}
        />
      ) : (
        <p className="page__note">
          Margen:{' '}
          {category?.marginPercent !== undefined ? formatPercent(category.marginPercent) : '—'}.
          Solo el dueño cambia los márgenes.
        </p>
      )}
    </FormDialog>
  );
}

function SubcategoryDialog({
  category,
  sub,
  isOwner,
  onClose,
  onDone,
}: {
  category: Category;
  sub?: Subcategory;
  isOwner: boolean;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(sub?.name ?? '');
  const [margin, setMargin] = useState(toInputText(sub?.marginPercent));
  const [errors, setErrors] = useState<{ name?: string; margin?: string }>({});

  const save = useMutation({
    mutationFn: () => {
      const marginValue = checkPercent(margin, 'El margen').value;
      if (!sub) {
        // El encargado no manda el margen: la subcategoría hereda el de la categoría.
        return catalogApi.createSubcategory(category.id, {
          name: name.trim(),
          ...(isOwner && marginValue ? { marginPercent: toApiNumber(marginValue) } : {}),
        });
      }
      const body: { name?: string; marginPercent?: string | null } = {};
      if (name.trim() !== sub.name) body.name = name.trim();
      if (isOwner) {
        const before = sub.marginPercent ?? null;
        const changed =
          marginValue === null ? before !== null : before === null || !marginValue.equals(before);
        if (changed) body.marginPercent = marginValue === null ? null : toApiNumber(marginValue);
      }
      return catalogApi.updateSubcategory(sub.id, body);
    },
    onSuccess: () =>
      onDone(sub ? 'Cambios guardados.' : `Se creó la subcategoría "${name.trim()}".`),
  });

  function submit() {
    const next: { name?: string; margin?: string } = {};
    if (name.trim() === '') next.name = 'Escribí el nombre.';
    else if (name.trim().length > 60) next.name = 'Puede tener hasta 60 caracteres.';
    if (isOwner) {
      const check = checkPercent(margin, 'El margen');
      if (check.error) next.margin = check.error;
    }
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  const nameTaken = save.error instanceof ApiError && save.error.code === 'SUBCATEGORY_NAME_TAKEN';
  return (
    <FormDialog
      title={sub ? `Editar ${sub.name}` : `Nueva subcategoría en ${category.name}`}
      submitLabel={sub ? 'Guardar' : 'Crear subcategoría'}
      busy={save.isPending}
      error={save.isError && !nameTaken ? friendlyMessage(save.error) : undefined}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label="Nombre"
        value={name}
        autoFocus
        maxLength={60}
        error={errors.name ?? (nameTaken ? friendlyMessage(save.error) : undefined)}
        onChange={(e) => setName(e.target.value)}
      />
      {isOwner ? (
        <TextField
          label="Margen propio (%)"
          hint="Vacío: usa el de la categoría."
          inputMode="decimal"
          value={margin}
          error={errors.margin}
          onChange={(e) => setMargin(e.target.value)}
        />
      ) : (
        <p className="page__note">
          Usa el margen de la categoría
          {category.marginPercent !== undefined
            ? ` (${formatPercent(category.marginPercent)})`
            : ''}
          . Solo el dueño cambia los márgenes.
        </p>
      )}
    </FormDialog>
  );
}
