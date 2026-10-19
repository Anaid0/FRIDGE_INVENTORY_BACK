import type { Category, Product } from '../../domain';

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
  description: string | null;
  unit: string;
  quantity: number;
  minStock: number;
  isLowStock: boolean;
  categoryId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toProductDto(product: Product): ProductDto {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    unit: product.unit,
    quantity: product.quantity,
    minStock: product.minStock,
    isLowStock: product.isLowStock(),
    categoryId: product.categoryId,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
