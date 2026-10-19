import type { Money } from '../shared/Money';
import type { UserRef } from '../user/UserRef';

/** Fila del historial de compras. */
export interface PurchaseListItem {
  id: string;
  periodId: string;
  periodName: string;
  buyer: UserRef;
  store: string | null;
  purchasedAt: Date;
  total: Money;
  itemsCount: number;
  hasReceipt: boolean;
  voidedAt: Date | null;
  createdAt: Date;
}
