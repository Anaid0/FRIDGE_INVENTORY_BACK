import type { DateRange, Page, PageRequest } from '../shared/Pagination';
import type { Purchase } from './Purchase';
import type { PurchaseListItem } from './PurchaseView';

export interface PurchaseFilter extends DateRange {
  periodId?: string;
  buyerId?: string;
  productId?: string;
  includeVoided?: boolean;
}

export interface PurchaseRepository {
  findById(id: string): Promise<Purchase | null>;
  findPage(filter: PurchaseFilter, page: PageRequest): Promise<Page<PurchaseListItem>>;
  /** Inserta la compra con sus líneas, o actualiza su estado (anulación / comprobante). */
  save(purchase: Purchase): Promise<void>;
}
