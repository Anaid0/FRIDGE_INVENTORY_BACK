import {
  InventoryMovement,
  MovementType,
  NotFoundError,
  type MovementSource,
  type Product,
  type Quantity,
} from '../../domain';
import type { IdGenerator, TransactionalRepositories } from '../ports';

export interface RecordStockInput {
  productId: string;
  type: MovementType;
  source?: MovementSource;
  quantity: Quantity;
  performedBy: string;
  registeredBy: string;
  note?: string | null;
  purchaseItemId?: string | null;
  now: Date;
}

export interface RecordedStock {
  movement: InventoryMovement;
  product: Product;
}

/**
 * Única forma de cambiar el stock: bloquea el producto, aplica el cambio y deja el movimiento en el log.
 * Debe llamarse dentro de un UnitOfWork. Lo reutilizan entradas/salidas manuales, compras y anulaciones.
 */
export class StockMovementRecorder {
  constructor(private readonly ids: IdGenerator) {}

  async record(
    repos: Pick<TransactionalRepositories, 'products' | 'movements'>,
    input: RecordStockInput,
  ): Promise<RecordedStock> {
    const product = await repos.products.findByIdForUpdate(input.productId);
    if (!product) {
      throw new NotFoundError('Producto no encontrado', 'PRODUCT_NOT_FOUND', { id: input.productId });
    }

    const stockChange =
      input.type === MovementType.IN
        ? product.addStock(input.quantity, input.now)
        : product.removeStock(input.quantity, input.now);
    await repos.products.save(product);

    const movement = InventoryMovement.record({
      id: this.ids.generate(),
      productId: product.id,
      type: input.type,
      source: input.source,
      quantity: input.quantity,
      stockChange,
      performedBy: input.performedBy,
      registeredBy: input.registeredBy,
      note: input.note,
      purchaseItemId: input.purchaseItemId,
      now: input.now,
    });
    await repos.movements.append(movement);

    return { movement, product };
  }
}
