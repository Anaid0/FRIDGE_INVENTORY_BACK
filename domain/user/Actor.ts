import type { Role } from './Role';

/** Usuario autenticado que ejecuta una acción. */
export interface Actor {
  id: string;
  role: Role;
}
