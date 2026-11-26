// Pedidos de la etapa 4 de caja (docs/api/caja.md) y mapeo por rol.
import type { UserRole } from '@kiosco/shared';
import { api } from '../api';
import { toQuery } from '../catalog/api';
import type { Paginated } from '../sales/types';
import type {
  CashListParams,
  CashMovement,
  CashSessionClosedPublic,
  CashSessionDetail,
  CashSessionListItem,
  CashSessionNote,
  CashSessionPublic,
  CloseCashBody,
  CloseResult,
  CreateCashMovementBody,
} from './types';

export const cashKeys = {
  all: ['cash-sessions'] as const,
  list: (params: CashListParams) => ['cash-sessions', 'list', params] as const,
  detail: (id: number) => ['cash-sessions', 'detail', id] as const,
  sales: (id: number, page: number) => ['cash-sessions', 'sales', id, page] as const,
};

/**
 * Deja solo los campos que puede ver el empleado de una caja (caja.md 2.1). Aunque la API
 * mandara de más (efectivo inicial, esperado…), acá se descartan.
 */
export function toPublicSession(raw: CashSessionPublic): CashSessionPublic {
  return {
    id: raw.id,
    shift: raw.shift,
    businessDate: raw.businessDate,
    status: raw.status,
    openedAt: raw.openedAt,
    openedBy: { id: raw.openedBy.id, fullName: raw.openedBy.fullName },
  };
}

/** Lo que el empleado ve de su cierre: que quedó cerrada y lo que él contó (H-46). */
export function toClosedPublic(raw: CashSessionClosedPublic): CashSessionClosedPublic {
  return {
    ...toPublicSession(raw),
    closedAt: raw.closedAt,
    closedBy: { id: raw.closedBy.id, fullName: raw.closedBy.fullName },
    countedCash: raw.countedCash,
  };
}

export function isEmployeeView(role: UserRole | null): boolean {
  // Sin rol conocido se trata como empleado: es lo más restrictivo.
  return role !== 'OWNER' && role !== 'MANAGER';
}

export const cashApi = {
  list: (params: CashListParams, signal?: AbortSignal) =>
    api.get<Paginated<CashSessionListItem>>(
      `/api/cash-sessions${toQuery({
        pageSize: 20,
        ...params,
        hasDifference:
          params.hasDifference === undefined ? undefined : String(params.hasDifference),
      })}`,
      signal,
    ),
  detail: (id: number, signal?: AbortSignal) =>
    api.get<CashSessionDetail>(`/api/cash-sessions/${id}`, signal),
  close: async (id: number, body: CloseCashBody, role: UserRole | null): Promise<CloseResult> => {
    const raw = await api.post<CashSessionDetail | CashSessionClosedPublic>(
      `/api/cash-sessions/${id}/close`,
      body,
    );
    if (isEmployeeView(role)) {
      return { kind: 'public', session: toClosedPublic(raw as CashSessionClosedPublic) };
    }
    return { kind: 'detail', session: raw as CashSessionDetail };
  },
  addNote: (id: number, note: string) =>
    api.post<CashSessionNote>(`/api/cash-sessions/${id}/notes`, { note }),
  createMovement: (body: CreateCashMovementBody) =>
    api.post<CashMovement>('/api/cash-movements', body),
};
