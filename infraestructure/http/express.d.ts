import type { KioskDeviceDto } from '../../application';
import type { Actor } from '../../domain';

declare global {
  namespace Express {
    interface Request {
      /** Usuario (admin) autenticado. Lo asigna `authenticate` con un token de usuario. */
      actor?: Actor;
      /** Tablet autorizada. Lo asigna `authenticate` con un token de tablet (KIOSK). */
      kioskDevice?: KioskDeviceDto;
    }
  }
}

export {};
