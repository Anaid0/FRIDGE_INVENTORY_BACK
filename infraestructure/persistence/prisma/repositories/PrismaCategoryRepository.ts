import type { Category, CategoryRepository } from '../../../../domain';
import { toCategory } from '../mappers';
import type { DbClient } from '../types';

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.category.findUnique({ where: { id } });
    return row ? toCategory(row) : null;
  }

  /** La collation utf8mb4_unicode_ci hace la comparación insensible a mayúsculas y acentos. */
  async findByName(name: string) {
    const row = await this.db.category.findUnique({ where: { name: name.trim() } });
    return row ? toCategory(row) : null;
  }

  async findAll() {
    return (await this.db.category.findMany({ orderBy: { name: 'asc' } })).map(toCategory);
  }

  async save(category: Category) {
    const data = { id: category.id, name: category.name, createdAt: category.createdAt };
    await this.db.category.upsert({ where: { id: category.id }, create: data, update: { name: data.name } });
  }
}
