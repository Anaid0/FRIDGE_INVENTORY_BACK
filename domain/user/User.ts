import { ValidationError } from '../shared/DomainError';
import { Guard } from '../shared/Guard';
import type { Email } from './Email';
import { Role } from './Role';

/**
 * Hay dos clases de usuario:
 * - ADMIN: cuenta con email + contraseña; inicia sesión y administra la app.
 * - EMPLOYEE ("persona"): solo nombre + PIN de 4 dígitos; se identifica en la tablet al sacar o meter productos.
 */
export interface UserProps {
  id: string;
  name: string;
  lastname: string;
  email: Email | null;
  passwordHash: string | null;
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
  /** Solo ADMIN: hash del código numérico con el que entra a la administración desde la tablet. */
  adminCodeHash?: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAdminInput {
  id: string;
  name: string;
  lastname: string;
  email: Email;
  passwordHash: string;
  now: Date;
}

export interface CreatePersonInput {
  id: string;
  name: string;
  lastname: string;
  pinHash: string;
  now: Date;
}

export interface FailedPinResult {
  locked: boolean;
  remainingAttempts: number;
  lockedUntil: Date | null;
}

const NAME_MAX = 100;
/** Intentos fallidos de PIN permitidos antes de bloquear a la persona. */
export const PIN_MAX_ATTEMPTS = 5;
/** Minutos de bloqueo tras agotar los intentos. */
export const PIN_LOCK_MINUTES = 5;

export class User {
  private constructor(private props: UserProps) {}

  static createAdmin(input: CreateAdminInput): User {
    return new User({
      ...User.baseProps(input),
      email: input.email,
      passwordHash: User.requiredHash(input.passwordHash, 'passwordHash'),
      pinHash: null,
      role: Role.ADMIN,
    });
  }

  static createPerson(input: CreatePersonInput): User {
    return new User({
      ...User.baseProps(input),
      email: null,
      passwordHash: null,
      pinHash: User.requiredHash(input.pinHash, 'pinHash'),
      role: Role.EMPLOYEE,
    });
  }

  /** Reconstruye un usuario ya persistido. */
  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get lastname(): string {
    return this.props.lastname;
  }
  get fullName(): string {
    return `${this.props.name} ${this.props.lastname}`;
  }
  get email(): Email | null {
    return this.props.email;
  }
  get passwordHash(): string | null {
    return this.props.passwordHash;
  }
  get pinHash(): string | null {
    return this.props.pinHash;
  }
  get failedPinAttempts(): number {
    return this.props.failedPinAttempts;
  }
  get pinLockedUntil(): Date | null {
    return this.props.pinLockedUntil;
  }
  get adminCodeHash(): string | null {
    return this.props.adminCodeHash ?? null;
  }
  get role(): Role {
    return this.props.role;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isAdmin(): boolean {
    return this.props.role === Role.ADMIN;
  }

  isPerson(): boolean {
    return this.props.role === Role.EMPLOYEE;
  }

  /** Una persona sin PIN (recién migrada) no aparece en la tablet hasta que el admin le asigne uno. */
  hasPin(): boolean {
    return this.props.pinHash !== null;
  }

  hasAdminCode(): boolean {
    return this.adminCodeHash !== null;
  }

  /** Solo los administradores tienen cuenta (email + contraseña) para iniciar sesión. */
  canLogIn(): boolean {
    return this.isAdmin() && this.props.email !== null && this.props.passwordHash !== null;
  }

  rename(name: string, lastname: string, now: Date): void {
    this.props.name = Guard.requiredText(name, 'name', NAME_MAX);
    this.props.lastname = Guard.requiredText(lastname, 'lastname', NAME_MAX);
    this.touch(now);
  }

  changeEmail(email: Email, now: Date): void {
    this.assertAccount();
    this.props.email = email;
    this.touch(now);
  }

  changePassword(passwordHash: string, now: Date): void {
    this.assertAccount();
    this.props.passwordHash = User.requiredHash(passwordHash, 'passwordHash');
    this.touch(now);
  }

  /** Código de administrador para entrar desde la tablet (ya validado y con hash). */
  changeAdminCode(adminCodeHash: string, now: Date): void {
    if (!this.isAdmin()) {
      throw new ValidationError('Solo los administradores tienen código de administrador', 'NOT_AN_ADMIN');
    }
    this.props.adminCodeHash = User.requiredHash(adminCodeHash, 'adminCodeHash');
    this.touch(now);
  }

  /** Nuevo PIN: también levanta cualquier bloqueo y reinicia los intentos. */
  changePin(pinHash: string, now: Date): void {
    this.assertPerson();
    this.props.pinHash = User.requiredHash(pinHash, 'pinHash');
    this.props.failedPinAttempts = 0;
    this.props.pinLockedUntil = null;
    this.touch(now);
  }

  isPinLocked(now: Date): boolean {
    return this.props.pinLockedUntil !== null && this.props.pinLockedUntil.getTime() > now.getTime();
  }

  /** Cuenta un PIN incorrecto; al llegar al máximo bloquea a la persona unos minutos. */
  registerFailedPin(now: Date): FailedPinResult {
    this.assertPerson();
    const attempts = this.props.failedPinAttempts + 1;
    if (attempts >= PIN_MAX_ATTEMPTS) {
      this.props.failedPinAttempts = 0;
      this.props.pinLockedUntil = new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000);
      this.touch(now);
      return { locked: true, remainingAttempts: 0, lockedUntil: this.props.pinLockedUntil };
    }
    this.props.failedPinAttempts = attempts;
    this.touch(now);
    return { locked: false, remainingAttempts: PIN_MAX_ATTEMPTS - attempts, lockedUntil: null };
  }

  /** PIN correcto: reinicia los intentos fallidos. */
  registerSuccessfulPin(now: Date): void {
    if (this.props.failedPinAttempts === 0 && this.props.pinLockedUntil === null) return;
    this.props.failedPinAttempts = 0;
    this.props.pinLockedUntil = null;
    this.touch(now);
  }

  activate(now: Date): void {
    this.props.isActive = true;
    this.touch(now);
  }

  deactivate(now: Date): void {
    this.props.isActive = false;
    this.touch(now);
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  private assertAccount(): void {
    if (!this.isAdmin()) {
      throw new ValidationError(
        'Las personas no tienen email ni contraseña: se identifican con su PIN',
        'NOT_AN_ACCOUNT',
      );
    }
  }

  private assertPerson(): void {
    if (!this.isPerson()) {
      throw new ValidationError('Los administradores no usan PIN', 'NOT_A_PERSON');
    }
  }

  private static baseProps(input: { id: string; name: string; lastname: string; now: Date }) {
    return {
      id: input.id,
      name: Guard.requiredText(input.name, 'name', NAME_MAX),
      lastname: Guard.requiredText(input.lastname, 'lastname', NAME_MAX),
      failedPinAttempts: 0,
      pinLockedUntil: null,
      isActive: true,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  private static requiredHash(hash: string, field: string): string {
    if (!hash || !hash.trim()) {
      throw new ValidationError(`${field} es obligatorio`, 'REQUIRED', { field });
    }
    return hash;
  }
}
