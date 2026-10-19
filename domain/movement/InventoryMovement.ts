import type { Quantity } from '../product/Quantity';
import type { StockChange } from '../product/StockChange';
import { ValidationError } from '../shared/DomainError';
import { Guard } from '../shared/Guard';
import { MovementSource } from './MovementSource';
import { MovementType } from './MovementType';

export interface InventoryMovementProps {
  id: string;
  productId: string;
  type: MovementType;
  source: MovementSource;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  performedBy: string; // quien sacó/metió el producto
  registeredBy: string; // quien lo registró en el sistema
  note: string | null;
  purchaseItemId: string | null;
  createdAt: Date;
}

export interface RecordMovementInput {
  id: string;
  productId: string;
  type: MovementType;
  source?: MovementSource; // MANUAL por defecto
  quantity: Quantity;
  stockChange: StockChange;
  performedBy: string;
  registeredBy: string;
  note?: string | null;
  purchaseItemId?: string | null;
  now: Date;
}

const NOTE_MAX = 255;

/** Registro inmutable de una entrada o salida de la nevera. */
export class InventoryMovement {
  private constructor(private readonly props: Readonly<InventoryMovementProps>) {}

  static record(input: RecordMovementInput): InventoryMovement {
    const { type, quantity, stockChange } = input;
    const expectedAfter =
      type === MovementType.IN ? stockChange.before + quantity.value : stockChange.before - quantity.value;
    if (stockChange.after !== expectedAfter) {
      throw new ValidationError('El cambio de stock no coincide con el movimiento', 'INCONSISTENT_MOVEMENT', {
        type,
        quantity: quantity.value,
        ...stockChange,
      });
    }
    const source = input.source ?? MovementSource.MANUAL;
    InventoryMovement.assertSourceConsistency(type, source, input.purchaseItemId ?? null);

    return new InventoryMovement({
      id: input.id,
      productId: input.productId,
      type,
      source,
      quantity: quantity.value,
      stockBefore: stockChange.before,
      stockAfter: stockChange.after,
      performedBy: input.performedBy,
      registeredBy: input.registeredBy,
      note: Guard.optionalText(input.note, 'note', NOTE_MAX),
      purchaseItemId: input.purchaseItemId ?? null,
      createdAt: input.now,
    });
  }

  static restore(props: InventoryMovementProps): InventoryMovement {
    return new InventoryMovement({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get productId(): string {
    return this.props.productId;
  }
  get type(): MovementType {
    return this.props.type;
  }
  get source(): MovementSource {
    return this.props.source;
  }
  get quantity(): number {
    return this.props.quantity;
  }
  get stockBefore(): number {
    return this.props.stockBefore;
  }
  get stockAfter(): number {
    return this.props.stockAfter;
  }
  get performedBy(): string {
    return this.props.performedBy;
  }
  get registeredBy(): string {
    return this.props.registeredBy;
  }
  get note(): string | null {
    return this.props.note;
  }
  get purchaseItemId(): string | null {
    return this.props.purchaseItemId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** true cuando alguien (el admin) lo registró a nombre de otra persona. */
  wasRegisteredOnBehalf(): boolean {
    return this.props.performedBy !== this.props.registeredBy;
  }

  /** Solo las salidas manuales son consumo real (las que cuentan en el ranking). */
  isWithdrawal(): boolean {
    return this.props.type === MovementType.OUT && this.props.source === MovementSource.MANUAL;
  }

  private static assertSourceConsistency(
    type: MovementType,
    source: MovementSource,
    purchaseItemId: string | null,
  ): void {
    const valid =
      (source === MovementSource.MANUAL && purchaseItemId === null) ||
      (source === MovementSource.PURCHASE && type === MovementType.IN && purchaseItemId !== null) ||
      (source === MovementSource.PURCHASE_VOID && type === MovementType.OUT && purchaseItemId === null);
    if (!valid) {
      throw new ValidationError('El origen del movimiento no es coherente', 'INCONSISTENT_MOVEMENT', {
        type,
        source,
        purchaseItemId,
      });
    }
  }
}
