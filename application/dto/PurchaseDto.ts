import type { PurchaseListItem, UserRef } from '../../domain';

export interface PurchaseListItemDto {
  id: string;
  periodId: string;
  periodName: string;
  buyer: UserRef;
  store: string | null;
  purchasedAt: Date;
  total: string;
  itemsCount: number;
  hasReceipt: boolean;
  voidedAt: Date | null;
  createdAt: Date;
}

export function toPurchaseListItemDto(item: PurchaseListItem): PurchaseListItemDto {
  return { ...item, total: item.total.toDecimalString() };
}

export interface PurchaseItemDetailDto {
  id: string;
  product: { id: string; name: string; unit: string };
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface PurchaseDetailDto {
  id: string;
  periodId: string;
  buyer: UserRef;
  registeredBy: UserRef;
  voidedBy: UserRef | null;
  store: string | null;
  purchasedAt: Date;
  total: string;
  hasReceipt: boolean;
  note: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  items: PurchaseItemDetailDto[];
}
