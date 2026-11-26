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
    select: (data): CurrentCashSessionResponse =>
      employee && data.cashSession
        ? { ...data, cashSession: toPublicSession(data.cashSession) }
        : data,
  });
}
