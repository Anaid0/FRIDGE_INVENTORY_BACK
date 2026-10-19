import { InsufficientStockError } from '../errors/InsufficientStockError';
import { ConflictError, ValidationError } from '../shared/DomainError';
import { Guard } from '../shared/Guard';
import type { Money } from '../shared/Money';
import type { Quantity } from './Quantity';
import type { StockChange } from './StockChange';

export interface ProductProps {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  quantity: number; // stock actual
  minStock: number;
  categoryId: string | null;
  /** Valora lo que se saca si el producto nunca se ha comprado (regalos, stock inicial). Opcional. */
  referencePrice?: Money | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductDetails {
  name: string;
  description?: string | null;
  unit?: string;
  minStock?: number;
  categoryId?: string | null;
  referencePrice?: Money | null;
}

const NAME_MAX = 120;
const DESCRIPTION_MAX = 255;
const UNIT_MAX = 20;
const DEFAULT_UNIT = 'unidad';

export class Product {
  private constructor(private props: ProductProps) {}

  /** Un producto nuevo empieza sin stock: el stock solo cambia mediante movimientos. */
  static create(input: ProductDetails & { id: string; now: Date }): Product {
    return new Product({
      id: input.id,
      ...Product.validateDetails(input),
      quantity: 0,
      isActive: true,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(props: ProductProps): Product {
    return new Product({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get referencePrice(): Money | null {
    return this.props.referencePrice ?? null;
  }
  get unit(): string {
    return this.props.unit;
  }
  get quantity(): number {
    return this.props.quantity;
  }
  get minStock(): number {
    return this.props.minStock;
  }
  get categoryId(): string | null {
    return this.props.categoryId;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isLowStock(): boolean {
    return this.props.quantity <= this.props.minStock;
  }

  updateDetails(details: ProductDetails, now: Date): void {
    this.props = { ...this.props, ...Product.validateDetails(details), updatedAt: now };
  }

  addStock(quantity: Quantity, now: Date): StockChange {
    this.assertActive();
    const before = this.props.quantity;
    this.props.quantity = before + quantity.value;
    this.props.updatedAt = now;
    return { before, after: this.props.quantity };
  }

  removeStock(quantity: Quantity, now: Date): StockChange {
    this.assertActive();
    const before = this.props.quantity;
    if (quantity.value > before) {
      throw new InsufficientStockError(this.props.id, before, quantity.value);
    }
    this.props.quantity = before - quantity.value;
    this.props.updatedAt = now;
    return { before, after: this.props.quantity };
  }

  activate(now: Date): void {
    this.props.isActive = true;
    this.props.updatedAt = now;
  }

  deactivate(now: Date): void {
    this.props.isActive = false;
    this.props.updatedAt = now;
  }

  private assertActive(): void {
    if (!this.props.isActive) {
      throw new ConflictError('El producto está desactivado', 'PRODUCT_INACTIVE', {
        productId: this.props.id,
      });
    }
  }

  private static validatePrice(price: Money | null): Money | null {
    if (price && price.isNegative()) {
      throw new ValidationError('El precio no puede ser negativo', 'INVALID_PRICE', {
        price: price.toDecimalString(),
      });
    }
    return price;
  }

  private static validateDetails(details: ProductDetails) {
    return {
      name: Guard.requiredText(details.name, 'name', NAME_MAX),
      description: Guard.optionalText(details.description, 'description', DESCRIPTION_MAX),
      unit: Guard.optionalText(details.unit, 'unit', UNIT_MAX) ?? DEFAULT_UNIT,
      minStock: Guard.nonNegativeInteger(details.minStock ?? 0, 'minStock'),
      categoryId: details.categoryId ?? null,
      referencePrice: Product.validatePrice(details.referencePrice ?? null),
    };
  }
}
