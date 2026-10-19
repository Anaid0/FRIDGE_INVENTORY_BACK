import type { DateRange, Page, PageRequest } from '../shared/Pagination';
import type { InventoryMovement } from './InventoryMovement';
import type { MovementSource } from './MovementSource';
import type { MovementType } from './MovementType';
import type { MovementView } from './MovementView';
import type { TopWithdrawer } from './TopWithdrawer';

export interface MovementFilter extends DateRange {
  type?: MovementType;
  source?: MovementSource;
  performedBy?: string;
  registeredBy?: string;
  productId?: string;
}

export interface MovementRepository {
  /** Los movimientos solo se insertan: nunca se editan ni se borran. */
  append(movement: InventoryMovement): Promise<void>;
  findPage(filter: MovementFilter, page: PageRequest): Promise<Page<MovementView>>;
  findLatest(limit: number): Promise<MovementView[]>;
  /** Ranking de retiros reales (type = OUT y source = MANUAL) agrupado por performed_by, de mayor a menor. */
  findTopWithdrawers(range: DateRange, limit: number): Promise<TopWithdrawer[]>;
}
