import type { KioskDevice, KioskDeviceRepository } from '../../../../domain';
import { toKioskDevice } from '../mappers';
import type { DbClient } from '../types';

export class PrismaKioskDeviceRepository implements KioskDeviceRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.kioskDevice.findUnique({ where: { id } });
    return row ? toKioskDevice(row) : null;
  }

  async findAll() {
    const rows = await this.db.kioskDevice.findMany({
      orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    return rows.map(toKioskDevice);
  }

  async save(device: KioskDevice) {
    const data = {
      id: device.id,
      name: device.name,
      createdBy: device.createdBy,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      revokedAt: device.revokedAt,
      revokedBy: device.revokedBy,
      failedPinAttempts: device.failedPinAttempts,
      pinLockedUntil: device.pinLockedUntil,
    };
    await this.db.kioskDevice.upsert({ where: { id: device.id }, create: data, update: data });
  }
}
