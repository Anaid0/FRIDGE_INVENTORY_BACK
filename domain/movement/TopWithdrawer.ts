import type { UserRef } from '../user/UserRef';

/** Fila del ranking de quién retira más productos (por performed_by). */
export interface TopWithdrawer {
  user: UserRef;
  totalWithdrawn: number; // unidades retiradas
  withdrawals: number; // cantidad de retiros
}
