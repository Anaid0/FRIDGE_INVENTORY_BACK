import type { UserRef } from '../user/UserRef';

/** Fila del ranking de quién retira más productos (por performed_by). */
/** Unidades que una persona sacó y metió a mano (sin compras ni anulaciones) en un rango. */
export interface PersonActivity {
  userId: string;
  withdrawn: number;
  stored: number;
}

export interface TopWithdrawer {
  user: UserRef;
  totalWithdrawn: number; // unidades retiradas
  withdrawals: number; // cantidad de retiros
}
