import type { Money } from '../shared/Money';
import { ValidationError } from '../shared/DomainError';
import { Guard } from '../shared/Guard';
import type { FundingPeriod } from './FundingPeriod';

export interface ContributionProps {
  id: string;
  periodId: string;
  userId: string; // quién aportó
  amount: Money;
  paidAt: Date;
  registeredBy: string;
  note: string | null;
  createdAt: Date;
}

export interface RegisterContributionInput {
  id: string;
  period: FundingPeriod;
  userId: string;
  amount: Money;
  paidAt: Date;
  registeredBy: string;
  note?: string | null;
  now: Date;
}

const NOTE_MAX = 255;

/** Aporte de dinero de una persona al fondo de una quincena. */
export class Contribution {
  private constructor(private readonly props: Readonly<ContributionProps>) {}

  static register(input: RegisterContributionInput): Contribution {
    input.period.assertOpen();
    if (!input.amount.isPositive()) {
      throw new ValidationError('El aporte debe ser mayor que 0', 'INVALID_AMOUNT', {
        amount: input.amount.toDecimalString(),
      });
    }
    return new Contribution({
      id: input.id,
      periodId: input.period.id,
      userId: input.userId,
      amount: input.amount,
      paidAt: Guard.validDate(input.paidAt, 'paidAt'),
      registeredBy: input.registeredBy,
      note: Guard.optionalText(input.note, 'note', NOTE_MAX),
      createdAt: input.now,
    });
  }

  static restore(props: ContributionProps): Contribution {
    return new Contribution({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get periodId(): string {
    return this.props.periodId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get paidAt(): Date {
    return this.props.paidAt;
  }
  get registeredBy(): string {
    return this.props.registeredBy;
  }
  get note(): string | null {
    return this.props.note;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
