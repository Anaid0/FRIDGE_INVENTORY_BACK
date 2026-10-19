import { ValidationError } from '../shared/DomainError';

/** Límite de INT UNSIGNED en MySQL. */
const MAX_QUANTITY = 4_294_967_295;

/** Cantidad de unidades de un movimiento o de una línea de compra: entero mayor que 0. */
export class Quantity {
  private constructor(readonly value: number) {}

  static create(value: number): Quantity {
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_QUANTITY) {
      throw new ValidationError('La cantidad debe ser un entero mayor que 0', 'INVALID_QUANTITY', { value });
    }
    return new Quantity(value);
  }

  equals(other: Quantity): boolean {
    return this.value === other.value;
  }
}
