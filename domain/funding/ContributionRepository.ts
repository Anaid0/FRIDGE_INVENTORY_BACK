import type { Contribution } from './Contribution';
import type { ContributionView } from './ContributionView';

export interface ContributionRepository {
  append(contribution: Contribution): Promise<void>;
  findByPeriod(periodId: string): Promise<ContributionView[]>;
}
