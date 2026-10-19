import type { Quantity } from '../product/Quantity';
import { ValidationError } from '../shared/DomainError';
import { Money } from '../shared/Money';

export interface PurchaseItemProps {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: Money;
  /** Lo que se pagó por la línea. Si no se guardó, cantidad × precio unitario. */
  subtotal?: Money;
  /** Compra por paquetes (p. ej. 2 sixpacks de 6): solo informativo; `quantity` ya son unidades. */
  packageCount?: number | null;
  unitsPerPackage?: number | null;
}

export interface CreatePurchaseItemInput {
  id: string;
  productId: string;
  quantity: Quantity;
  unitPrice: Money;
}

export interface CreatePurchaseItemFromTotalInput {
  id: string;
  productId: string;
  /** Unidades compradas (con paquetes: paquetes × unidades por paquete). */
  quantity: Quantity;
  /** Lo que se pagó por todas esas unidades (con descuentos incluidos). */
  total: Money;
  packageCount?: Quantity | null;
  unitsPerPackage?: Quantity | null;
}

/**
 * Línea de una compra. Dos formas de registrarla:
 * - por unidad: cantidad y precio unitario (subtotal = cantidad × precio);
 * - por total o por paquetes: unidades y lo que se pagó; el precio unitario es total ÷ unidades
 *   (redondeado al centavo) y el subtotal es exactamente lo pagado.
 * El precio unitario es el que valora lo que cada persona saca de la nevera.
 */
export class PurchaseItem {
  private constructor(private readonly props: Readonly<PurchaseItemProps>) {}

  static create(input: CreatePurchaseItemInput): PurchaseItem {
    PurchaseItem.assertNotNegative(input.unitPrice, input.productId);
    return new PurchaseItem({
      id: input.id,
      productId: input.productId,
      quantity: input.quantity.value,
      unitPrice: input.unitPrice,
    });
  }

  static fromTotal(input: CreatePurchaseItemFromTotalInput): PurchaseItem {
    PurchaseItem.assertNotNegative(input.total, input.productId);
    const packages = input.packageCount ?? null;
    const perPackage = input.unitsPerPackage ?? null;
    if ((packages === null) !== (perPackage === null)) {
      throw new ValidationError(
        'Para comprar por paquetes indica cuántos paquetes y cuántas unidades trae cada uno',
        'INVALID_PACKAGES',
        { productId: input.productId },
      );
    }
    if (packages && perPackage && packages.value * perPackage.value !== input.quantity.value) {
      throw new ValidationError('Las unidades no coinciden con los paquetes', 'INVALID_PACKAGES', {
        productId: input.productId,
      });
    }
    const quantity = input.quantity.value;
    return new PurchaseItem({
      id: input.id,
      productId: input.productId,
      quantity,
      unitPrice: Money.fromCents(Math.round(input.total.cents / quantity)),
      subtotal: input.total,
      packageCount: packages?.value ?? null,
      unitsPerPackage: perPackage?.value ?? null,
    });
  }

  static restore(props: PurchaseItemProps): PurchaseItem {
    return new PurchaseItem({ ...props });
  }

  private static assertNotNegative(price: Money, productId: string): void {
    if (price.isNegative()) {
      throw new ValidationError('El precio no puede ser negativo', 'INVALID_PRICE', { productId });
    }
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
    return this.props.subtotal ?? this.props.unitPrice.multiply(this.props.quantity);
  }
  get packageCount(): number | null {
    return this.props.packageCount ?? null;
  }
  get unitsPerPackage(): number | null {
    return this.props.unitsPerPackage ?? null;
  }
}
