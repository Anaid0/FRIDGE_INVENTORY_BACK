import type { DateRange, ProductRepository, ReportScope, SpendingReportReader } from '../../domain';
import { getProductOrFail } from '../shared/loaders';

export interface ProductSpendingDto {
  productId: string;
  productName: string;
  units: number;
  spent: string;
  averageUnitPrice: string;
}

export interface CategorySpendingDto {
  categoryId: string | null;
  categoryName: string;
  units: number;
  spent: string;
}

export interface PricePointDto {
  purchaseId: string;
  purchasedAt: Date;
  unitPrice: string;
  store: string | null;
}

/** Gasto por producto (excluye compras anuladas), de mayor a menor. */
export class GetSpendingByProductUseCase {
  constructor(private readonly reports: SpendingReportReader) {}

  async execute(scope: ReportScope): Promise<ProductSpendingDto[]> {
    return (await this.reports.spendingByProduct(scope)).map((row) => ({
      ...row,
      spent: row.spent.toDecimalString(),
      averageUnitPrice: row.averageUnitPrice.toDecimalString(),
    }));
  }
}

export class GetSpendingByCategoryUseCase {
  constructor(private readonly reports: SpendingReportReader) {}

  async execute(scope: ReportScope): Promise<CategorySpendingDto[]> {
    return (await this.reports.spendingByCategory(scope)).map((row) => ({
      ...row,
      spent: row.spent.toDecimalString(),
    }));
  }
}

export class GetProductPriceHistoryUseCase {
  constructor(
    private readonly reports: SpendingReportReader,
    private readonly products: ProductRepository,
  ) {}

  async execute(productId: string, range: DateRange = {}): Promise<PricePointDto[]> {
    await getProductOrFail(this.products, productId);
    return (await this.reports.priceHistory(productId, range)).map((point) => ({
      ...point,
      unitPrice: point.unitPrice.toDecimalString(),
    }));
  }
}
