// Configuración del negocio (solo dueño): nombre, redondeo de precios y hora de corte.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '../lib/format';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { TextField } from '../components/TextField';
import { serverErrorToFields } from '../lib/formErrors';
import { catalogApi, keys } from '../lib/catalog/api';
import { toApiNumber, toInputText } from '../lib/catalog/decimalInput';
import type { Settings } from '../lib/catalog/types';
import { checkMoney } from '../lib/catalog/validation';
import { useIsRemote } from '../lib/useRole';
import { PaymentMethodsSection } from './PaymentMethodsSection';

const FIELDS = ['storeName', 'priceRoundingStep', 'businessDayCutoff'] as const;

export function SettingsPage() {
  const settings = useQuery({
    queryKey: keys.settings,
    queryFn: ({ signal }) => catalogApi.settings(signal),
  });
  return (
    <div className="page">
      <h1>Configuración</h1>
      {settings.isPending && <LoadingState label="Cargando la configuración…" />}
      {settings.isError && (
        <ErrorMessage
          title="No se pudo cargar la configuración"
          error={settings.error}
          onRetry={() => void settings.refetch()}
        />
      )}
      {settings.isSuccess && <SettingsForm settings={settings.data} />}
      <PaymentMethodsSection />
    </div>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  const isRemote = useIsRemote();
  const [storeName, setStoreName] = useState(settings.storeName);
  const [step, setStep] = useState(toInputText(settings.priceRoundingStep));
  const [cutoff, setCutoff] = useState(settings.businessDayCutoff);
  const [errors, setErrors] = useState<Partial<Record<(typeof FIELDS)[number], string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ¿Hay algo distinto de lo guardado? Si no, el botón queda apagado (no se manda un pedido vacío).
  const stepValue = checkMoney(step, 'El redondeo').value;
  const hasChanges =
    storeName.trim() !== settings.storeName ||
    cutoff !== settings.businessDayCutoff ||
    stepValue === null ||
    !stepValue.equals(settings.priceRoundingStep);

  const save = useMutation({
    mutationFn: () => {
      const stepValue = checkMoney(step, 'El redondeo').value;
      const body: Parameters<typeof catalogApi.updateSettings>[0] = {};
      if (storeName.trim() !== settings.storeName) body.storeName = storeName.trim();
      if (stepValue && !stepValue.equals(settings.priceRoundingStep))
        body.priceRoundingStep = toApiNumber(stepValue);
      if (cutoff !== settings.businessDayCutoff) body.businessDayCutoff = cutoff;
      return catalogApi.updateSettings(body);
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(keys.settings, data);
      // El formulario sigue montado (así el aviso se ve): se lo vuelve a llenar con lo guardado.
      setStoreName(data.storeName);
      setStep(toInputText(data.priceRoundingStep));
      setCutoff(data.businessDayCutoff);
      setSaved(true);
    },
    onError: (error) => {
      const mapped = serverErrorToFields(error, FIELDS);
      setErrors(mapped.fields);
      setFormError(mapped.form ?? null);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    setFormError(null);
    const next: typeof errors = {};
    if (storeName.trim() === '') next.storeName = 'Escribí el nombre del negocio.';
    else if (storeName.trim().length > 80) next.storeName = 'Puede tener hasta 80 caracteres.';
    const stepCheck = checkMoney(step, 'El redondeo');
    if (stepCheck.error) next.priceRoundingStep = stepCheck.error;
    else if (stepCheck.value === null)
      next.priceRoundingStep = 'Escribí el redondeo. Con 0 no se redondea.';
    else if (stepCheck.value.gt(10000)) next.priceRoundingStep = 'El máximo es $ 10.000.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff))
      next.businessDayCutoff = 'Elegí una hora válida.';
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  return (
    <form className="panel" onSubmit={onSubmit} noValidate>
      {saved && <Notice variant="success">Se guardó la configuración.</Notice>}
      <TextField
        label="Nombre del negocio"
        hint="Aparece en los encabezados de reportes y pedidos."
        value={storeName}
        maxLength={80}
        error={errors.storeName}
        onChange={(e) => {
          setStoreName(e.target.value);
          setSaved(false);
        }}
      />
      <TextField
        label="Redondeo de precios ($)"
        hint="El precio sugerido siempre sube hasta el múltiplo de este valor. Por ejemplo, con 10: $ 1.432 pasa a $ 1.440. Con 0 no se redondea. Los precios ya guardados no cambian."
        inputMode="decimal"
        value={step}
        error={errors.priceRoundingStep}
        onChange={(e) => {
          setStep(e.target.value);
          setSaved(false);
        }}
      />
      <TextField
        label="Hora de corte del día de trabajo"
        disabled={isRemote}
        hint={
          isRemote
            ? 'Solo desde el local.'
            : 'A qué hora termina un día para los reportes y la caja. Elegí una hora en la que el kiosco esté cerrado. Los registros anteriores no se mueven.'
        }
        type="time"
        value={cutoff}
        error={errors.businessDayCutoff}
        onChange={(e) => {
          setCutoff(e.target.value);
          setSaved(false);
        }}
      />
      {formError && <ErrorMessage title="No se pudo guardar" message={formError} />}
      <div className="form__actions">
        <Button type="submit" large loading={save.isPending} disabled={!hasChanges}>
          {hasChanges ? 'Guardar configuración' : 'Sin cambios para guardar'}
        </Button>
      </div>
      <p className="page__note">
        {settings.updatedBy
          ? `Última modificación: ${formatDateTime(settings.updatedAt)} por ${settings.updatedBy.fullName}.`
          : `Última modificación: ${formatDateTime(settings.updatedAt)}.`}
      </p>
    </form>
  );
}
