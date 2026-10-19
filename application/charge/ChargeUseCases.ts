import {
  ConflictError,
  ConsumptionCharge,
  Contribution,
  Money,
  NotFoundError,
  ValidationError,
  type Actor,
  type ConsumptionChargeRepository,
  type FundingPeriod,
  type FundingPeriodRepository,
  type MovementRepository,
  type UserRepository,
} from '../../domain';
import {
  toConsumptionChargeDto,
  toContributionDto,
  toEstimatedChargeDto,
  type ConsumptionChargeDto,
  type ContributionDto,
  type PeriodChargesDto,
} from '../dto';
import type { Clock, IdGenerator, TransactionalRepositories, UnitOfWork } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { periodRange } from '../shared/dates';
import { getPeriodOrFail, getUserOrFail } from '../shared/loaders';

/**
 * "Quien más consume, más aporta": valora lo que cada persona sacó en la quincena (al precio guardado en
 * cada retiro) y guarda su cobro. Si ya existían cobros, los actualiza; uno que ya no corresponde se borra
 * solo si no tiene pagos (si los tiene, queda en $0 para no perder el registro del pago).
 * Se usa al cerrar la quincena y al recalcular; corre dentro de la transacción del llamador.
 */
export class ConsumptionChargeGenerator {
  constructor(
    private readonly ids: IdGenerator,
    private readonly timeZone: string,
  ) {}

  async generate(
    repos: Pick<TransactionalRepositories, 'movements' | 'charges'>,
    period: FundingPeriod,
    now: Date,
  ): Promise<void> {
    const consumption = await repos.movements.findConsumptionByPerson(periodRange(period, this.timeZone));
    const existing = new Map((await repos.charges.findByPeriod(period.id)).map((c) => [c.userId, c]));

    for (const person of consumption) {
      const charge = existing.get(person.userId);
      if (charge) {
        charge.recompute(person, now);
        await repos.charges.save(charge);
        existing.delete(person.userId);
      } else {
        await repos.charges.save(
          ConsumptionCharge.fromConsumption({
            id: this.ids.generate(),
            periodId: period.id,
            consumption: person,
            now,
          }),
        );
      }
    }
    for (const stale of existing.values()) {
      if ((await repos.charges.paidAmount(stale.id)).isZero()) await repos.charges.delete(stale.id);
      else {
        stale.recompute({ amount: Money.zero(), units: 0, unpricedUnits: 0 }, now);
        await repos.charges.save(stale);
      }
    }
  }
}

function totalsOf(charges: ConsumptionChargeDto[]): PeriodChargesDto['totals'] {
  const sum = (field: 'amount' | 'paid' | 'pending') =>
    Money.sum(charges.map((c) => Money.fromDecimal(c[field]))).toDecimalString();
  return {
    amount: sum('amount'),
    paid: sum('paid'),
    pending: sum('pending'),
    unpricedUnits: charges.reduce((n, c) => n + c.unpricedUnits, 0),
  };
}

/**
 * Cobros de una quincena. Cerrada: los guardados, con lo pagado. Abierta: estimación en vivo de lo que
 * cada uno lleva consumido (se guarda al cerrarla).
 */
export class GetPeriodChargesUseCase {
  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly movements: MovementRepository,
    private readonly charges: ConsumptionChargeRepository,
    private readonly users: UserRepository,
    private readonly timeZone: string,
  ) {}

  async execute(periodId: string): Promise<PeriodChargesDto> {
    const period = await getPeriodOrFail(this.periods, periodId);
    const saved = period.isOpen() ? [] : await this.charges.findViewsByPeriod(periodId);

    let charges: ConsumptionChargeDto[];
    if (saved.length > 0) {
      charges = saved.map(toConsumptionChargeDto);
    } else {
      const consumption = await this.movements.findConsumptionByPerson(periodRange(period, this.timeZone));
      charges = await Promise.all(
        consumption.map(async (c) => {
          const user = await getUserOrFail(this.users, c.userId);
          return toEstimatedChargeDto(
            c,
            { id: period.id, name: period.name },
            { id: user.id, name: user.name, lastname: user.lastname },
          );
        }),
      );
    }
    return {
      periodId,
      status: saved.length > 0 ? 'generated' : 'estimate',
      canGenerate: !period.isOpen(),
      charges,
      totals: totalsOf(charges),
    };
  }
}

/** Recalcula los cobros de una quincena cerrada (p. ej. se registró tarde un retiro con fecha de esa quincena). */
export class GenerateConsumptionChargesUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly generator: ConsumptionChargeGenerator,
    private readonly getCharges: GetPeriodChargesUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(periodId: string, actor: Actor): Promise<PeriodChargesDto> {
    requireAdmin(actor);
    await this.uow.run(async (repos) => {
      const period = await getPeriodOrFail(repos.periods, periodId);
      if (period.isOpen()) {
        throw new ConflictError(
          'Los cobros se generan al cerrar la quincena; mientras está abierta solo hay una estimación',
          'PERIOD_STILL_OPEN',
          { periodId },
        );
      }
      await this.generator.generate(repos, period, this.clock.now());
    });
    return this.getCharges.execute(periodId);
  }
}

/** Cobros de quincenas anteriores que todavía tienen saldo pendiente (de la más vieja a la más nueva). */
export class ListPendingChargesUseCase {
  constructor(private readonly charges: ConsumptionChargeRepository) {}

  async execute(): Promise<ConsumptionChargeDto[]> {
    return (await this.charges.findPendingViews()).map(toConsumptionChargeDto);
  }
}

export interface PayChargeInput {
  /** Por defecto, todo lo pendiente. */
  amount?: string | number;
  paidAt?: Date;
  note?: string | null;
}

/**
 * Registra el pago (total o parcial) de un cobro: es un aporte de esa persona a la quincena abierta, el
 * fondo del siguiente mercado. No se puede pagar más de lo pendiente.
 */
export class PayConsumptionChargeUseCase {
  constructor(
    private readonly periods: FundingPeriodRepository,
    private readonly charges: ConsumptionChargeRepository,
    private readonly contributions: { append(contribution: Contribution): Promise<void> },
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(chargeId: string, input: PayChargeInput, actor: Actor): Promise<ContributionDto> {
    requireAdmin(actor);
    const charge = await this.charges.findById(chargeId);
    if (!charge) throw new NotFoundError('Cobro no encontrado', 'CHARGE_NOT_FOUND', { id: chargeId });

    const pending = charge.amount.subtract(await this.charges.paidAmount(chargeId));
    if (!pending.isPositive()) {
      throw new ConflictError('Este cobro ya está pagado', 'CHARGE_ALREADY_PAID', { chargeId });
    }
    const amount = input.amount !== undefined ? Money.fromDecimal(input.amount) : pending;
    if (amount.cents > pending.cents) {
      throw new ValidationError('El pago es mayor que lo pendiente', 'PAYMENT_EXCEEDS_PENDING', {
        pending: pending.toDecimalString(),
      });
    }

    const open = await this.periods.findOpen();
    if (!open) {
      throw new ConflictError(
        'No hay una quincena abierta: abre la siguiente para recibir el pago',
        'NO_OPEN_PERIOD',
      );
    }
    const now = this.clock.now();
    const contribution = Contribution.register({
      id: this.ids.generate(),
      period: open,
      userId: charge.userId,
      amount,
      paidAt: input.paidAt ?? now,
      registeredBy: actor.id,
      note: input.note,
      chargeId: charge.id,
      now,
    });
    await this.contributions.append(contribution);
    return toContributionDto(contribution);
  }
}
