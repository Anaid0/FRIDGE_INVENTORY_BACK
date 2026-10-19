import type { Request } from 'express';
import type { KioskDeviceDto } from '../../application';
import { UnauthorizedError, type Actor } from '../../domain';

export function actorOf(req: Request): Actor {
  if (!req.actor) throw new UnauthorizedError();
  return req.actor;
}

export function kioskDeviceOf(req: Request): KioskDeviceDto {
  if (!req.kioskDevice) throw new UnauthorizedError();
  return req.kioskDevice;
}

/** Parámetro de ruta obligatorio (siempre existe si la ruta coincidió). */
export function param(req: Request, name: string): string {
  return String(req.params[name] ?? '');
}
