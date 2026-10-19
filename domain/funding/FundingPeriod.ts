import { PeriodClosedError } from '../errors/PeriodClosedError';
import { ConflictError, ValidationError } from '../shared/DomainError';
import { Guard } from '../shared/Guard';
import { PeriodStatus } from './PeriodStatus';

export interface FundingPeriodProps {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  notes: string | null;
  createdBy: string;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenFundingPeriodInput {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  notes?: string | null;
  createdBy: string;
  now: Date;
}

const NAME_MAX = 60;
const NOTES_MAX = 255;

/** Quincena: período en el que el equipo reúne dinero y compra productos. */
export class FundingPeriod {
  private constructor(private props: FundingPeriodProps) {}

  static open(input: OpenFundingPeriodInput): FundingPeriod {
    const startDate = Guard.validDate(input.startDate, 'startDate');
    const endDate = Guard.validDate(input.endDate, 'endDate');
    if (startDate.getTime() > endDate.getTime()) {
      throw new ValidationError(
        'La fecha de inicio no puede ser posterior a la de fin',
        'INVALID_PERIOD_RANGE',
      );
    }
    return new FundingPeriod({
      id: input.id,
      name: Guard.requiredText(input.name, 'name', NAME_MAX),
      startDate,
      endDate,
      status: PeriodStatus.OPEN,
      notes: Guard.optionalText(input.notes, 'notes', NOTES_MAX),
      createdBy: input.createdBy,
      closedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(props: FundingPeriodProps): FundingPeriod {
    return new FundingPeriod({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get startDate(): Date {
    return this.props.startDate;
  }
  get endDate(): Date {
    return this.props.endDate;
  }
  get status(): PeriodStatus {
    return this.props.status;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get closedAt(): Date | null {
    return this.props.closedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isOpen(): boolean {
    return this.props.status === PeriodStatus.OPEN;
  }

  /** Lanza PeriodClosedError si la quincena ya no acepta aportes ni compras. */
  assertOpen(): void {
    if (!this.isOpen()) {
      throw new PeriodClosedError(this.props.id);
    }
  }

  close(now: Date): void {
    if (!this.isOpen()) {
      throw new ConflictError('La quincena ya está cerrada', 'PERIOD_ALREADY_CLOSED', {
        periodId: this.props.id,
      });
    }
    this.props.status = PeriodStatus.CLOSED;
    this.props.closedAt = now;
    this.props.updatedAt = now;
  }
}
