import { Role, type User, type UserFilter, type UserRepository } from '../../../../domain';
import { fromUser, toUser } from '../mappers';
import type { DbClient } from '../types';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string) {
    const row = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    return row ? toUser(row) : null;
  }

  async findAll(filter: UserFilter = {}) {
    const rows = await this.db.user.findMany({
      where: {
        role: filter.role,
        isActive: filter.isActive,
        ...(filter.search && {
          OR: [
            { name: { contains: filter.search } },
            { lastname: { contains: filter.search } },
            { email: { contains: filter.search } },
          ],
        }),
      },
      orderBy: [{ name: 'asc' }, { lastname: 'asc' }],
    });
    return rows.map(toUser);
  }

  async countActiveAdmins() {
    return this.db.user.count({ where: { role: Role.ADMIN, isActive: true } });
  }

  async save(user: User) {
    const data = fromUser(user);
    await this.db.user.upsert({ where: { id: user.id }, create: data, update: data });
  }
}
