import { ConflictError } from '../shared/DomainError';
import { Guard } from '../shared/Guard';

export interface KioskDeviceProps {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

const NAME_MAX = 60;
/** No se actualiza "última conexión" en cada petición: como mucho una vez por minuto. */
const SEEN_THROTTLE_MS = 60_000;

/**
 * Tablet autorizada por un admin para registrar movimientos con PIN.
 * Su token es de larga duración; para dejarla sin acceso se revoca (no se borra: queda el historial).
 */
export class KioskDevice {
  private constructor(private props: KioskDeviceProps) {}

  static pair(input: { id: string; name: string; createdBy: string; now: Date }): KioskDevice {
    return new KioskDevice({
      id: input.id,
      name: Guard.requiredText(input.name, 'name', NAME_MAX),
      createdBy: input.createdBy,
      createdAt: input.now,
      lastSeenAt: null,
      revokedAt: null,
      revokedBy: null,
    });
  }

  static restore(props: KioskDeviceProps): KioskDevice {
    return new KioskDevice({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get lastSeenAt(): Date | null {
    return this.props.lastSeenAt;
  }
  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }
  get revokedBy(): string | null {
    return this.props.revokedBy;
  }

  isActive(): boolean {
    return this.props.revokedAt === null;
  }

  /** Marca actividad; devuelve true si cambió (para guardar solo cuando hace falta). */
  markSeen(now: Date): boolean {
    const last = this.props.lastSeenAt;
    if (last && now.getTime() - last.getTime() < SEEN_THROTTLE_MS) return false;
    this.props.lastSeenAt = now;
    return true;
  }

  revoke(revokedBy: string, now: Date): void {
    if (!this.isActive()) {
      throw new ConflictError('Esta tablet ya estaba revocada', 'DEVICE_ALREADY_REVOKED', {
        deviceId: this.props.id,
      });
    }
    this.props.revokedAt = now;
    this.props.revokedBy = revokedBy;
  }
}
