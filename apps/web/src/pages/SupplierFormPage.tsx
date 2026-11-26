// Alta y edición de proveedores (encargado y dueño).
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { TextAreaField } from '../components/TextAreaField';
import { TextField } from '../components/TextField';
import { ApiError } from '../lib/api';
import { serverErrorToFields, type FieldErrors } from '../lib/formErrors';
import { supplierKeys, suppliersApi } from '../lib/purchases/api';
import { WEEKDAYS, formatTaxId } from '../lib/purchases/labels';
import type { Supplier, SupplierBody, Weekday } from '../lib/purchases/types';

const FIELDS = ['name', 'phone', 'email', 'taxId', 'visitDays', 'notes'] as const;
type FieldName = (typeof FIELDS)[number];

export function SupplierFormPage() {
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const supplier = useQuery({
    queryKey: supplierKeys.detail(editingId ?? 0),
    queryFn: ({ signal }) => suppliersApi.get(editingId ?? 0, signal),
    enabled: editingId !== null,
  });
  if (editingId !== null && supplier.isPending)
    return <LoadingState label="Cargando el proveedor…" />;
  if (editingId !== null && supplier.isError) {
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
  return <SupplierForm supplier={editingId !== null ? supplier.data : undefined} />;
}

/** Los teléfonos se escriben de mil formas: acá solo se controlan los caracteres; el resto lo valida el servidor. */
const PHONE_CHARS = /^[\d\s+\-.()]*$/;

function SupplierForm({ supplier }: { supplier: Supplier | undefined }) {
  const editing = supplier !== undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(supplier?.name ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [taxId, setTaxId] = useState(supplier ? formatTaxId(supplier.taxId) : '');
  const [days, setDays] = useState<Weekday[]>(supplier?.visitDays ?? []);
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // CUIT repetido (H-58): el servidor avisa y pide confirmar.
  const [duplicate, setDuplicate] = useState<string | null>(null);

  function buildBody(confirm: boolean): SupplierBody {
    const body: SupplierBody = {
      name: name.trim(),
      phone: phone.trim() === '' ? null : phone.trim(),
      email: email.trim() === '' ? null : email.trim(),
      taxId: taxId.trim() === '' ? null : taxId.trim(),
      visitDays: days,
      notes: notes.trim() === '' ? null : notes.trim(),
    };
    if (confirm) body.confirmDuplicateTaxId = true;
    return body;
  }

  const save = useMutation({
    mutationFn: (confirm: boolean) =>
      editing
        ? suppliersApi.update(supplier.id, buildBody(confirm))
        : suppliersApi.create(buildBody(confirm)),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      void navigate(`/proveedores/${saved.id}`, {
        state: { notice: editing ? 'Cambios guardados.' : 'Proveedor creado.' },
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'SUPPLIER_TAX_ID_DUPLICATE') {
        const other = error.details?.supplierName;
        setDuplicate(typeof other === 'string' ? other : 'otro proveedor');
        return;
      }
      setDuplicate(null);
      if (error instanceof ApiError && error.code === 'SUPPLIER_NAME_TAKEN') {
        setErrors({
          name: 'Ya hay un proveedor con ese nombre (puede estar desactivado). Elegí otro.',
        });
        return;
      }
      const mapped = serverErrorToFields(error, FIELDS);
      setErrors(mapped.fields);
      setFormError(mapped.form ?? null);
    },
  });

  function validate(): FieldErrors<FieldName> {
    const next: FieldErrors<FieldName> = {};
    if (name.trim() === '') next.name = 'Escribí el nombre del proveedor.';
    else if (name.trim().length > 80) next.name = 'El nombre puede tener hasta 80 caracteres.';
    if (!PHONE_CHARS.test(phone)) {
      next.phone = 'El teléfono solo lleva números. Ej.: 11 2345-6789.';
    } else if (phone.replace(/\D/g, '').length > 0 && phone.replace(/\D/g, '').length < 10) {
      next.phone =
        'Faltan números. Escribí el código de área sin el 0 y el número sin el 15 (10 números en total).';
    }
    if (email.trim() !== '' && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = 'El email no parece válido. Revisalo.';
    }
    if (notes.length > 500) next.notes = 'Las notas pueden tener hasta 500 caracteres.';
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

  const backTo = editing ? `/proveedores/${supplier.id}` : '/proveedores';
  return (
    <div className="page">
      <Link to={backTo} className="back-link">
        ‹ {editing ? 'Volver a la cuenta' : 'Volver a Proveedores'}
      </Link>
      <h1>{editing ? `Editar ${supplier.name}` : 'Nuevo proveedor'}</h1>

      <form className="form form--wide" onSubmit={onSubmit} noValidate>
        <fieldset className="fieldset">
          <legend>Datos del proveedor</legend>
          <TextField
            label="Nombre"
            value={name}
            maxLength={80}
            autoFocus
            error={errors.name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="form__row">
            <TextField
              label="Teléfono / WhatsApp (opcional)"
              hint="Con el código de área, sin 0 y sin 15. Son 10 números. Ej.: 11 2345-6789."
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              error={errors.phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <TextField
              label="CUIT (opcional)"
              hint="Con o sin guiones. Ej.: 30-71234567-1."
              inputMode="numeric"
              autoComplete="off"
              value={taxId}
              error={errors.taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />
          </div>
          <TextField
            label="Email (opcional)"
            type="email"
            autoComplete="off"
            value={email}
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </fieldset>

        <fieldset className="fieldset">
          <legend>Cuándo viene</legend>
          <p className="field__hint">Los días que pasa el repartidor o el preventista (opcional).</p>
          <div className="segmented">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d.value);
              return (
                <label key={d.value} className={`segmented__item${on ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setDays((prev) =>
                        on ? prev.filter((x) => x !== d.value) : [...prev, d.value],
                      )
                    }
                  />
                  {d.label}
                </label>
              );
            })}
          </div>
          {errors.visitDays && <span className="field__error">{errors.visitDays}</span>}
        </fieldset>

        <TextAreaField
          label="Notas (opcional)"
          hint="Por ejemplo: nombre del preventista o hasta qué hora se pasa el pedido."
          value={notes}
          maxLength={500}
          rows={3}
          error={errors.notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {formError && <ErrorMessage title="No se pudo guardar" message={formError} />}
        <div className="form__actions">
          <Button type="submit" large loading={save.isPending}>
            {editing ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
          <Link to={backTo} className="btn btn--secondary btn--large">
            Cancelar
          </Link>
        </div>
      </form>

      {duplicate !== null && (
        <ConfirmDialog
          title="Ese CUIT ya está cargado"
          confirmLabel="Guardar igual"
          cancelLabel="Revisar el CUIT"
          busy={save.isPending}
          onCancel={() => setDuplicate(null)}
          onConfirm={() => save.mutate(true)}
        >
          <p>
            El CUIT lo tiene <strong>{duplicate}</strong>. A veces un mismo proveedor tiene dos
            nombres, y está bien. Si fue un error al escribirlo, revisalo.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
