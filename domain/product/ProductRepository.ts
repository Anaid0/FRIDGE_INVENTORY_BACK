import type { Product } from './Product';

export interface ProductFilter {
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  includeInactive?: boolean;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  /**
   * Igual que findById pero bloquea la fila hasta que termine la transacción actual
   * (SELECT ... FOR UPDATE). Se usa antes de cambiar el stock.
   */
  findByIdForUpdate(id: string): Promise<Product | null>;
  findByName(name: string): Promise<Product | null>;
  findAll(filter?: ProductFilter): Promise<Product[]>;
  save(product: Product): Promise<void>;
}
