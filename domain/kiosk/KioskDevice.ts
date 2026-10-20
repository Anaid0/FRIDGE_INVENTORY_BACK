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
  /** PIN incorrectos seguidos en esta tablet (el PIN identifica a la persona: no se sabe de quién era). */
  failedPinAttempts?: number;
  pinLockedUntil?: Date | null;
}

const NAME_MAX = 60;
/** Tras estos PIN incorrectos seguidos, la tablet deja de aceptar PIN un rato (contra probar PIN al azar). */
export const KIOSK_PIN_MAX_ATTEMPTS = 5;
export const KIOSK_PIN_LOCK_MINUTES = 2;

export interface KioskFailedPinResult {
  locked: boolean;
  remainingAttempts: number;
  lockedUntil: Date | null;
}
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

  get failedPinAttempts(): number {
    return this.props.failedPinAttempts ?? 0;
  }
  get pinLockedUntil(): Date | null {
    return this.props.pinLockedUntil ?? null;
  }

  isPinLocked(now: Date): boolean {
    const until = this.props.pinLockedUntil;
    return until !== null && until !== undefined && until.getTime() > now.getTime();
  }

  /** Un PIN que no es de nadie: cuenta el intento y, al llegar al máximo, bloquea la tablet unos minutos. */
  registerFailedPin(now: Date): KioskFailedPinResult {
    const attempts = this.failedPinAttempts + 1;
    if (attempts >= KIOSK_PIN_MAX_ATTEMPTS) {
      this.props.failedPinAttempts = 0;
      this.props.pinLockedUntil = new Date(now.getTime() + KIOSK_PIN_LOCK_MINUTES * 60_000);
      return { locked: true, remainingAttempts: 0, lockedUntil: this.props.pinLockedUntil };
    }
    this.props.failedPinAttempts = attempts;
    return { locked: false, remainingAttempts: KIOSK_PIN_MAX_ATTEMPTS - attempts, lockedUntil: null };
  }

  /** Un PIN correcto reinicia la cuenta. Devuelve true si había algo que limpiar (para guardar solo entonces). */
  registerSuccessfulPin(): boolean {
    if (!this.failedPinAttempts && !this.props.pinLockedUntil) return false;
    this.props.failedPinAttempts = 0;
    this.props.pinLockedUntil = null;
    return true;
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
