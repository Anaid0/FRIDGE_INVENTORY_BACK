import type { Role, User, UserRef } from '../../domain';

export interface UserDto {
  id: string;
  name: string;
  lastname: string;
  fullName: string;
  /** Solo los administradores tienen email. */
  email: string | null;
  role: Role;
  isActive: boolean;
  /** Si el admin ya tiene código para entrar desde la tablet (nunca se expone el código ni su hash). */
  hasAdminCode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Nunca expone hashes de contraseña, de PIN ni del código de administrador. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    lastname: user.lastname,
    fullName: user.fullName,
    email: user.email?.value ?? null,
    role: user.role,
    isActive: user.isActive,
    hasAdminCode: user.hasAdminCode(),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toUserRef(user: User): UserRef {
  return { id: user.id, name: user.name, lastname: user.lastname };
}

/** Persona (empleado) tal como la ve el administrador. */
export interface PersonDto {
  id: string;
  name: string;
  lastname: string;
  fullName: string;
  isActive: boolean;
  hasPin: boolean;
  isPinLocked: boolean;
  pinLockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPersonDto(user: User, now: Date): PersonDto {
  const locked = user.isPinLocked(now);
  return {
    id: user.id,
    name: user.name,
    lastname: user.lastname,
    fullName: user.fullName,
    isActive: user.isActive,
    hasPin: user.hasPin(),
    isPinLocked: locked,
    pinLockedUntil: locked ? user.pinLockedUntil : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
