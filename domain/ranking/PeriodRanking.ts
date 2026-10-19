import type { TopWithdrawer } from '../movement/TopWithdrawer';
import type { UserRef } from '../user/UserRef';

/** Un puesto del ranking guardado de una quincena. */
export interface PeriodRankingEntry {
  /** Puesto con empates: dos personas con las mismas unidades y retiros comparten puesto (1, 1, 3…). */
  position: number;
  user: UserRef;
  totalWithdrawn: number;
  withdrawals: number;
}

/** Quién pulsó "Calcular el más hambriento": un administrador o una tablet autorizada. */
export type RankingAuthor = { kind: 'user'; id: string } | { kind: 'kiosk'; id: string };

export interface PeriodRankingProps {
  periodId: string;
  computedAt: Date;
  computedBy: RankingAuthor;
  entries: PeriodRankingEntry[];
}

/**
 * Resultado calculado del ranking de una quincena: el podio y "el más hambriento".
 * Es una foto: no cambia aunque después se registren movimientos con fecha de esa quincena;
 * para actualizarla hay que volver a calcularla.
 */
export class PeriodRanking {
  private constructor(private readonly props: PeriodRankingProps) {}

  /** `rows` ya viene ordenado de mayor a menor (unidades y, a igualdad, cantidad de retiros). */
  static compute(input: {
    periodId: string;
    rows: TopWithdrawer[];
    computedBy: RankingAuthor;
    now: Date;
  }): PeriodRanking {
    const entries: PeriodRankingEntry[] = [];
    input.rows.forEach((row, index) => {
      const previous = entries[index - 1];
      const tied =
        previous !== undefined &&
        previous.totalWithdrawn === row.totalWithdrawn &&
        previous.withdrawals === row.withdrawals;
      entries.push({
        position: tied ? previous.position : index + 1,
        user: row.user,
        totalWithdrawn: row.totalWithdrawn,
        withdrawals: row.withdrawals,
      });
    });
    return new PeriodRanking({
      periodId: input.periodId,
      computedAt: input.now,
      computedBy: input.computedBy,
      entries,
    });
  }

  static restore(props: PeriodRankingProps): PeriodRanking {
    return new PeriodRanking({ ...props, entries: [...props.entries] });
  }

  get periodId(): string {
    return this.props.periodId;
  }
  get computedAt(): Date {
    return this.props.computedAt;
  }
  get computedBy(): RankingAuthor {
    return this.props.computedBy;
  }
  get entries(): readonly PeriodRankingEntry[] {
    return this.props.entries;
  }

  /** Los que ocupan el primer puesto (más de uno si hay empate). Vacío si nadie sacó nada. */
  get hungriest(): PeriodRankingEntry[] {
    return this.props.entries.filter((e) => e.position === 1);
  }

  /** Los tres primeros lugares de la lista (el podio). */
  get podium(): PeriodRankingEntry[] {
    return this.props.entries.slice(0, 3);
  }
}
