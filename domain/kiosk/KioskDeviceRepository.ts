import type { KioskDevice } from './KioskDevice';

export interface KioskDeviceRepository {
  findById(id: string): Promise<KioskDevice | null>;
  /** Todas, las activas primero y luego por fecha de alta (más recientes primero). */
  findAll(): Promise<KioskDevice[]>;
  save(device: KioskDevice): Promise<void>;
}
