import type { KioskDevice, User, UserRef } from '../../domain';

export interface KioskDeviceDto {
  id: string;
  name: string;
  isActive: boolean;
  createdBy: UserRef | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

export function toKioskDeviceDto(device: KioskDevice, createdBy: UserRef | null = null): KioskDeviceDto {
  return {
    id: device.id,
    name: device.name,
    isActive: device.isActive(),
    createdBy,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
  };
}

/** Lo que la tablet muestra de cada persona: nombre e iniciales (nunca nada del PIN). */
export interface KioskPersonDto {
  id: string;
  name: string;
  lastname: string;
  initials: string;
}

export function toKioskPersonDto(person: User): KioskPersonDto {
  return {
    id: person.id,
    name: person.name,
    lastname: person.lastname,
    initials: `${person.name.charAt(0)}${person.lastname.charAt(0)}`.toUpperCase(),
  };
}
