import type { DateRange } from '../shared/Pagination';
import type { Money } from '../shared/Money';

/** Alcance de un reporte: una quincena concreta o un rango de fechas. */
export type ReportScope = { periodId: string } | DateRange;

export interface ProductSpending {
  productId: string;
  productName: string;
  units: number;
  spent: Money;
  averageUnitPrice: Money;
}

export interface CategorySpending {
  categoryId: string | null; // null = sin categoría
  categoryName: string;
  units: number;
  spent: Money;
}

export interface PricePoint {
  purchaseId: string;
  purchasedAt: Date;
  unitPrice: Money;
  store: string | null;
}

/**
 * Puerto de solo lectura para los reportes de gasto.
 * Separado de PurchaseRepository (ISP): los reportes no necesitan escribir.
 * Todas las consultas excluyen las compras anuladas.
 */
export interface SpendingReportReader {
  spendingByProduct(scope: ReportScope): Promise<ProductSpending[]>;
  spendingByCategory(scope: ReportScope): Promise<CategorySpending[]>;
  priceHistory(productId: string, range?: DateRange): Promise<PricePoint[]>;
}
