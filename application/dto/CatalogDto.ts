import type { Category, Money, Product } from '../../domain';

export interface CategoryDto {
  id: string;
  name: string;
  createdAt: Date;
}

export function toCategoryDto(category: Category): CategoryDto {
  return { id: category.id, name: category.name, createdAt: category.createdAt };
}

export interface ProductDto {
  id: string;
  name: string;
  /** Código de 2 dígitos del teclado de la tablet (null solo si no se le ha asignado). */
  code: string | null;
  description: string | null;
  unit: string;
  quantity: number;
  minStock: number;
  isLowStock: boolean;
  categoryId: string | null;
  /** Precio que puso el admin para productos sin compras (decimal) o null. */
  referencePrice: string | null;
  /** Lo que vale una unidad hoy al sacarla: última compra o, si no hay, el de referencia. null si no se sabe. */
  currentPrice: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toProductDto(product: Product, lastPurchasePrice: Money | null = null): ProductDto {
  const current = lastPurchasePrice ?? product.referencePrice;
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    description: product.description,
    unit: product.unit,
    quantity: product.quantity,
    minStock: product.minStock,
    isLowStock: product.isLowStock(),
    categoryId: product.categoryId,
    referencePrice: product.referencePrice?.toDecimalString() ?? null,
    currentPrice: current?.toDecimalString() ?? null,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
