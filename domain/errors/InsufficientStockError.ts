import { ConflictError } from '../shared/DomainError';

export class InsufficientStockError extends ConflictError {
  constructor(productId: string, available: number, requested: number) {
    super(`Stock insuficiente: hay ${available} y se intentan retirar ${requested}`, 'INSUFFICIENT_STOCK', {
      productId,
      available,
      requested,
    });
  }
}
