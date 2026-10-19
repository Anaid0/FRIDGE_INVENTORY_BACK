import type { ConsumptionChargeView, PersonConsumption, UserRef } from '../../domain';

/** Lo que una persona debe aportar por lo que consumió en una quincena (montos en decimal "32000.00"). */
export interface ConsumptionChargeDto {
  /** null en una estimación (quincena abierta): todavía no hay cobro guardado. */
  id: string | null;
  period: { id: string; name: string };
  user: UserRef;
  amount: string;
  paid: string;
  pending: string;
  units: number;
  unpricedUnits: number;
  computedAt: Date | null;
}

export interface PeriodChargesDto {
  periodId: string;
  /** 'generated': cobros guardados al cerrar la quincena. 'estimate': cálculo en vivo (quincena abierta). */
  status: 'generated' | 'estimate';
  /** La quincena está cerrada: se pueden generar o recalcular los cobros. */
  canGenerate: boolean;
  charges: ConsumptionChargeDto[];
  totals: { amount: string; paid: string; pending: string; unpricedUnits: number };
}

export function toConsumptionChargeDto(view: ConsumptionChargeView): ConsumptionChargeDto {
  const pending = view.amount.subtract(view.paid);
  return {
    id: view.id,
    period: view.period,
    user: view.user,
    amount: view.amount.toDecimalString(),
    paid: view.paid.toDecimalString(),
    pending: pending.isNegative() ? '0.00' : pending.toDecimalString(),
    units: view.units,
    unpricedUnits: view.unpricedUnits,
    computedAt: view.computedAt,
  };
}

export function toEstimatedChargeDto(
  consumption: PersonConsumption,
  period: { id: string; name: string },
  user: UserRef,
): ConsumptionChargeDto {
  return {
    id: null,
    period,
    user,
    amount: consumption.amount.toDecimalString(),
    paid: '0.00',
    pending: consumption.amount.toDecimalString(),
    units: consumption.units,
    unpricedUnits: consumption.unpricedUnits,
    computedAt: null,
  };
}
