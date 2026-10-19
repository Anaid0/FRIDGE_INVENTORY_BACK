export const PeriodStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type PeriodStatus = (typeof PeriodStatus)[keyof typeof PeriodStatus];
