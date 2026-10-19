import type { Quantity } from '../product/Quantity';
import { ValidationError } from '../shared/DomainError';
import type { Money } from '../shared/Money';

export interface PurchaseItemProps {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: Money;
}

export interface CreatePurchaseItemInput {
  id: string;
  productId: string;
  quantity: Quantity;
  unitPrice: Money;
}

/** Línea de una compra. El subtotal siempre se calcula: cantidad × precio unitario. */
export class PurchaseItem {
  private constructor(private readonly props: Readonly<PurchaseItemProps>) {}

  static create(input: CreatePurchaseItemInput): PurchaseItem {
    if (input.unitPrice.isNegative()) {
      throw new ValidationError('El precio unitario no puede ser negativo', 'INVALID_PRICE', {
        productId: input.productId,
      });
    }
    return new PurchaseItem({
      id: input.id,
      productId: input.productId,
      quantity: input.quantity.value,
      unitPrice: input.unitPrice,
    });
  }

  static restore(props: PurchaseItemProps): PurchaseItem {
    return new PurchaseItem({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get productId(): string {
    return this.props.productId;
  }
  get quantity(): number {
    return this.props.quantity;
  }
  get unitPrice(): Money {
    return this.props.unitPrice;
  }
  get subtotal(): Money {
    return this.props.unitPrice.multiply(this.props.quantity);
  }
}
