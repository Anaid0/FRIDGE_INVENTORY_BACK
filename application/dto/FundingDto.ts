import type {
  Contribution,
  ContributionView,
  FundingPeriod,
  PeriodStatus,
  PeriodSummary,
  UserRef,
} from '../../domain';
import { toDateOnly } from '../shared/dates';

export interface FundingPeriodDto {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  status: PeriodStatus;
  notes: string | null;
  createdBy: string;
  closedAt: Date | null;
  createdAt: Date;
}

export function toFundingPeriodDto(period: FundingPeriod): FundingPeriodDto {
  return {
    id: period.id,
    name: period.name,
    startDate: toDateOnly(period.startDate),
    endDate: toDateOnly(period.endDate),
    status: period.status,
    notes: period.notes,
    createdBy: period.createdBy,
    closedAt: period.closedAt,
    createdAt: period.createdAt,
  };
}

export interface PeriodSummaryDto {
  periodId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  collected: string; // decimal "100000.00"
  spent: string;
  balance: string;
  isOverspent: boolean;
}

export function toPeriodSummaryDto(summary: PeriodSummary): PeriodSummaryDto {
  return {
    periodId: summary.periodId,
    name: summary.name,
    startDate: toDateOnly(summary.startDate),
    endDate: toDateOnly(summary.endDate),
    status: summary.status,
    collected: summary.collected.toDecimalString(),
    spent: summary.spent.toDecimalString(),
    balance: summary.balance.toDecimalString(),
    isOverspent: summary.isOverspent,
  };
}

export interface ContributionDto {
  id: string;
  periodId: string;
  userId: string;
  amount: string;
  paidAt: Date;
  registeredBy: string;
  note: string | null;
  createdAt: Date;
}

export function toContributionDto(contribution: Contribution): ContributionDto {
  return {
    id: contribution.id,
    periodId: contribution.periodId,
    userId: contribution.userId,
    amount: contribution.amount.toDecimalString(),
    paidAt: contribution.paidAt,
    registeredBy: contribution.registeredBy,
    note: contribution.note,
    createdAt: contribution.createdAt,
  };
}

export interface ContributionViewDto {
  id: string;
  periodId: string;
  user: UserRef;
  amount: string;
  paidAt: Date;
  note: string | null;
  registeredBy: UserRef;
  createdAt: Date;
}

export function toContributionViewDto(view: ContributionView): ContributionViewDto {
  return { ...view, amount: view.amount.toDecimalString() };
}
