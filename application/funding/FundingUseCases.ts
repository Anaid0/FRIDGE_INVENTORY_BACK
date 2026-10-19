import {
  Contribution,
  ConflictError,
  FundingPeriod,
  Money,
  NotFoundError,
  type Actor,
  type ContributionRepository,
  type FundingPeriodRepository,
  type PurchaseRepository,
  type UserRef,
  type UserRepository,
} from '../../domain';
import {
  toContributionDto,
  toContributionViewDto,
  toFundingPeriodDto,
  toPeriodSummaryDto,
  toPurchaseListItemDto,
  type ContributionDto,
  type ContributionViewDto,
  type FundingPeriodDto,
  type PeriodSummaryDto,
  type PurchaseListItemDto,
} from '../dto';
import type { ConsumptionChargeGenerator } from '../charge/ChargeUseCases';
import type { Clock, IdGenerator, UnitOfWork } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { getActiveUserOrFail, getPeriodOrFail } from '../shared/loaders';
import { MAX_PAGE_SIZE } from '../shared/pagination';

export interface OpenFundingPeriodInput {
  name: string;
  startDate: Date;
  endDate: Date;
  notes?: string | null;
}

/** Abre una quincena. Solo puede haber una abierta y no pueden cruzarse en fechas. */
export class OpenFundingPeriodUseCase {
  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: OpenFundingPeriodInput, actor: Actor): Promise<FundingPeriodDto> {
    requireAdmin(actor);
    const period = FundingPeriod.open({
      ...input,
      id: this.ids.generate(),
      createdBy: actor.id,
      now: this.clock.now(),
    });

    const open = await this.periods.findOpen();
    if (open) {
      throw new ConflictError(
        `Ya hay una quincena abierta (${open.name}); ciérrala primero`,
        'OPEN_PERIOD_EXISTS',
        {
          periodId: open.id,
        },
      );
    }
    if (await this.periods.existsOverlapping(period.startDate, period.endDate)) {
      throw new ConflictError('Las fechas se cruzan con otra quincena', 'PERIOD_OVERLAP');
    }

    await this.periods.save(period);
    return toFundingPeriodDto(period);
  }
}

/**
 * Cierra la quincena y, en la misma transacción, genera los cobros por consumo: lo que cada persona debe
 * aportar al siguiente mercado según lo que sacó (quien más consume, más aporta).
 */
export class CloseFundingPeriodUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly charges: ConsumptionChargeGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(periodId: string, actor: Actor): Promise<FundingPeriodDto> {
    requireAdmin(actor);
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const period = await getPeriodOrFail(repos.periods, periodId);
      period.close(now);
      await repos.periods.save(period);
      await this.charges.generate(repos, period, now);
      return toFundingPeriodDto(period);
    });
  }
}

export class ListFundingPeriodsUseCase {
  constructor(private readonly periods: FundingPeriodRepository) {}

  async execute(): Promise<PeriodSummaryDto[]> {
    return (await this.periods.findAllSummaries()).map(toPeriodSummaryDto);
  }
}

/** Resumen de la quincena abierta, o null si no hay ninguna. */
export class GetCurrentFundingPeriodUseCase {
  constructor(private readonly periods: FundingPeriodRepository) {}

  async execute(): Promise<PeriodSummaryDto | null> {
    const open = await this.periods.findOpen();
    if (!open) return null;
    const summary = await this.periods.findSummary(open.id);
    return summary ? toPeriodSummaryDto(summary) : null;
  }
}

export interface ContributorTotalDto {
  user: UserRef;
  total: string;
  contributions: number;
}

export interface FundingPeriodDetailDto {
  period: FundingPeriodDto;
  summary: PeriodSummaryDto;
  contributions: ContributionViewDto[];
  contributorTotals: ContributorTotalDto[];
  purchases: PurchaseListItemDto[];
}

export class GetFundingPeriodDetailUseCase {
  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly contributions: ContributionRepository,
    private readonly purchases: PurchaseRepository,
  ) {}

  async execute(periodId: string): Promise<FundingPeriodDetailDto> {
    const period = await getPeriodOrFail(this.periods, periodId);
    const [summary, contributions, purchases] = await Promise.all([
      this.periods.findSummary(periodId),
      this.contributions.findByPeriod(periodId),
      this.purchases.findPage({ periodId, includeVoided: true }, { page: 1, pageSize: MAX_PAGE_SIZE }),
    ]);
    if (!summary) throw new NotFoundError('Quincena no encontrada', 'PERIOD_NOT_FOUND', { id: periodId });

    const totals = new Map<string, { user: UserRef; total: Money; contributions: number }>();
    for (const contribution of contributions) {
      const entry = totals.get(contribution.user.id) ?? {
        user: contribution.user,
        total: Money.zero(),
        contributions: 0,
      };
      entry.total = entry.total.add(contribution.amount);
      entry.contributions += 1;
      totals.set(contribution.user.id, entry);
    }

    return {
      period: toFundingPeriodDto(period),
      summary: toPeriodSummaryDto(summary),
      contributions: contributions.map(toContributionViewDto),
      contributorTotals: [...totals.values()]
        .sort((a, b) => b.total.cents - a.total.cents)
        .map((entry) => ({ ...entry, total: entry.total.toDecimalString() })),
      purchases: purchases.items.map(toPurchaseListItemDto),
    };
  }
}

export interface RegisterContributionInput {
  userId: string;
  amount: string | number;
  paidAt: Date;
  note?: string | null;
}

export class RegisterContributionUseCase {
  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly users: UserRepository,
    private readonly contributions: ContributionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(periodId: string, input: RegisterContributionInput, actor: Actor): Promise<ContributionDto> {
    requireAdmin(actor);
    const period = await getPeriodOrFail(this.periods, periodId);
    await getActiveUserOrFail(this.users, input.userId);

    const contribution = Contribution.register({
      id: this.ids.generate(),
      period,
      userId: input.userId,
      amount: Money.fromDecimal(input.amount),
      paidAt: input.paidAt,
      registeredBy: actor.id,
      note: input.note,
      now: this.clock.now(),
    });
    await this.contributions.append(contribution);
    return toContributionDto(contribution);
  }
}
