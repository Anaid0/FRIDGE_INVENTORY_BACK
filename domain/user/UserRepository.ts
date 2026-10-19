import type { Role } from './Role';
import type { User } from './User';

export interface UserFilter {
  role?: Role;
  isActive?: boolean;
  search?: string; // nombre, apellido o email
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(filter?: UserFilter): Promise<User[]>;
  countActiveAdmins(): Promise<number>;
  /** Inserta o actualiza. */
  save(user: User): Promise<void>;
}
