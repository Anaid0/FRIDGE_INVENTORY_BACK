import type { Product, ProductFilter, ProductRepository } from '../../../../domain';
import { fromProduct, toProduct } from '../mappers';
import type { DbClient } from '../types';

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.product.findUnique({ where: { id } });
    return row ? toProduct(row) : null;
  }

  /** Bloquea la fila (SELECT ... FOR UPDATE) hasta que termine la transacción en curso. */
  async findByIdForUpdate(id: string) {
    await this.db.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
    return this.findById(id);
  }

  async findByName(name: string) {
    const row = await this.db.product.findUnique({ where: { name: name.trim() } });
    return row ? toProduct(row) : null;
  }

  async findAll(filter: ProductFilter = {}) {
    const rows = await this.db.product.findMany({
      where: {
        isActive: filter.includeInactive ? undefined : true,
        categoryId: filter.categoryId,
        ...(filter.search && { name: { contains: filter.search } }),
        // Comparación entre columnas: quantity <= min_stock
        ...(filter.lowStock && { quantity: { lte: this.db.product.fields.minStock } }),
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(toProduct);
  }

  async save(product: Product) {
    const data = fromProduct(product);
    await this.db.product.upsert({ where: { id: product.id }, create: data, update: data });
  }
}
