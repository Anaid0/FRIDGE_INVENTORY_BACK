import type { InventoryMovement, MovementSource, MovementType } from '../../domain';

export interface MovementDto {
  id: string;
  productId: string;
  type: MovementType;
  source: MovementSource;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  performedBy: string;
  registeredBy: string;
  note: string | null;
  purchaseItemId: string | null;
  /** Salidas manuales: precio unitario guardado al sacar (decimal), o null. */
  unitPrice: string | null;
  createdAt: Date;
}

export function toMovementDto(movement: InventoryMovement): MovementDto {
  return {
    id: movement.id,
    productId: movement.productId,
    type: movement.type,
    source: movement.source,
    quantity: movement.quantity,
    stockBefore: movement.stockBefore,
    stockAfter: movement.stockAfter,
    performedBy: movement.performedBy,
    registeredBy: movement.registeredBy,
    note: movement.note,
    purchaseItemId: movement.purchaseItemId,
    unitPrice: movement.unitPrice?.toDecimalString() ?? null,
    createdAt: movement.createdAt,
  };
}
