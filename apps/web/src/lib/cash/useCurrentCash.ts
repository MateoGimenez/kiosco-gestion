// La caja abierta, ya filtrada según el rol: el empleado nunca conserva el efectivo inicial.
import { useQuery } from '@tanstack/react-query';
import { salesApi, salesKeys } from '../sales/api';
import type { CurrentCashSessionResponse } from '../sales/types';
import { useRole } from '../useRole';
import { isEmployeeView, toPublicSession } from './api';

export function useCurrentCash() {
  const role = useRole();
  const employee = isEmployeeView(role);
  return useQuery({
    queryKey: salesKeys.currentCash,
    queryFn: ({ signal }) => salesApi.currentCash(signal),
    // El empleado no conserva el efectivo inicial ni el cierre anterior, aunque la API los mandara.
    select: (data): CurrentCashSessionResponse => {
      if (!employee) return data;
      const { previousClosing: _omit, ...rest } = data;
      return { ...rest, cashSession: data.cashSession ? toPublicSession(data.cashSession) : null };
    },
  });
}
