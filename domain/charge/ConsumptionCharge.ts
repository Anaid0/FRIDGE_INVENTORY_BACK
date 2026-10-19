import { Money } from '../shared/Money';
import type { UserRef } from '../user/UserRef';

/** Lo que una persona sacó en un rango de fechas, valorado en dinero. */
export interface PersonConsumption {
  userId: string;
  units: number;
  /** Suma de cantidad × precio de cada retiro (precio guardado al sacar, o el de referencia del producto). */
  amount: Money;
  /** Unidades sin precio conocido: cuentan como $0. */
  unpricedUnits: number;
}

export interface ConsumptionChargeProps {
  id: string;
  periodId: string;
  userId: string;
  amount: Money;
  units: number;
  unpricedUnits: number;
  computedAt: Date;
}

/**
 * "Quien más consume, más aporta": lo que una persona consumió en una quincena, en dinero. Lo paga como
 * aporte al siguiente mercado (uno o varios aportes con `chargeId`). Se recalcula si hace falta, pero el
 * monto ya pagado nunca se borra.
 */
export class ConsumptionCharge {
  private constructor(private props: ConsumptionChargeProps) {}

  static fromConsumption(input: {
    id: string;
    periodId: string;
    consumption: PersonConsumption;
    now: Date;
  }): ConsumptionCharge {
    return new ConsumptionCharge({
      id: input.id,
      periodId: input.periodId,
      userId: input.consumption.userId,
      amount: input.consumption.amount,
      units: input.consumption.units,
      unpricedUnits: input.consumption.unpricedUnits,
      computedAt: input.now,
    });
  }

  static restore(props: ConsumptionChargeProps): ConsumptionCharge {
    return new ConsumptionCharge({ ...props });
  }

  /** Vuelve a valorar el consumo (p. ej. se registró tarde un retiro con fecha de la quincena). */
  recompute(consumption: Pick<PersonConsumption, 'amount' | 'units' | 'unpricedUnits'>, now: Date): void {
    this.props = { ...this.props, ...consumption, computedAt: now };
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
  get units(): number {
    return this.props.units;
  }
  get unpricedUnits(): number {
    return this.props.unpricedUnits;
  }
  get computedAt(): Date {
    return this.props.computedAt;
  }
}

/** Cobro con lo pagado hasta ahora (lectura). */
export interface ConsumptionChargeView {
  id: string;
  period: { id: string; name: string };
  user: UserRef;
  amount: Money;
  units: number;
  unpricedUnits: number;
  computedAt: Date;
  paid: Money;
}

export interface ConsumptionChargeRepository {
  findById(id: string): Promise<ConsumptionCharge | null>;
  findByPeriod(periodId: string): Promise<ConsumptionCharge[]>;
  /** Cobros de una quincena con lo pagado, de mayor a menor monto. */
  findViewsByPeriod(periodId: string): Promise<ConsumptionChargeView[]>;
  /** Cobros de cualquier quincena a los que todavía les falta pago, de la quincena más vieja a la más nueva. */
  findPendingViews(): Promise<ConsumptionChargeView[]>;
  /** Suma de los aportes que pagan este cobro. */
  paidAmount(chargeId: string): Promise<Money>;
  save(charge: ConsumptionCharge): Promise<void>;
  /** Borra un cobro que ya no corresponde (solo si no tiene pagos; lo verifica el caso de uso). */
  delete(chargeId: string): Promise<void>;
}

/**
 * Valora retiros sueltos y los agrupa por persona. Precio de cada retiro: el guardado al sacar; si no hay,
 * el de referencia del producto; si tampoco, $0 (cuenta en `unpricedUnits`). Lo usan los repositorios.
 */
export function valueConsumption(
  withdrawals: { userId: string; quantity: number; unitPrice: Money | null; referencePrice: Money | null }[],
): PersonConsumption[] {
  const byUser = new Map<string, PersonConsumption>();
  for (const w of withdrawals) {
    const row = byUser.get(w.userId) ?? {
      userId: w.userId,
      units: 0,
      amount: Money.zero(),
      unpricedUnits: 0,
    };
    const price = w.unitPrice ?? w.referencePrice;
    row.units += w.quantity;
    if (price) row.amount = row.amount.add(price.multiply(w.quantity));
    else row.unpricedUnits += w.quantity;
    byUser.set(w.userId, row);
  }
  return [...byUser.values()].sort((a, b) => b.amount.cents - a.amount.cents || b.units - a.units);
}
