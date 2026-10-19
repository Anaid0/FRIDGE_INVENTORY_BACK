import type { Money } from '../shared/Money';
import type { UserRef } from '../user/UserRef';

export interface ContributionView {
  id: string;
  periodId: string;
  user: UserRef;
  amount: Money;
  paidAt: Date;
  note: string | null;
  registeredBy: UserRef;
  createdAt: Date;
}
