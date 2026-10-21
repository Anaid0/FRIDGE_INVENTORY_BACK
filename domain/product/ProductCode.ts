import { ValidationError } from '../shared/DomainError';

const FORMAT = /^[1-9]\d$/;

/** Filas de la máquina (primer dígito) y columnas (segundo dígito) en el orden en que se reparten. */
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const FIRST_COLUMNS = [1, 2, 3, 4];
const LAST_COLUMNS = [5, 6, 7, 8, 9];

/**
 * Orden de asignación automática, en filas de 4 como la cuadrícula de la máquina:
 * 11-14, 21-24, ..., 91-94; luego 15-19, ..., 95-99; y por último 10, 20, ..., 90.
 * (La migración que les dio código a los productos existentes usa este mismo orden.)
 */
const ASSIGNMENT_ORDER: readonly string[] = [
  ...ROWS.flatMap((row) => FIRST_COLUMNS.map((column) => `${row}${column}`)),
  ...ROWS.flatMap((row) => LAST_COLUMNS.map((column) => `${row}${column}`)),
  ...ROWS.map((row) => `${row}0`),
];

/** Código de 2 dígitos (del 10 al 99) que se marca en el teclado de la tablet para elegir un producto. */
export class ProductCode {
  private constructor(readonly value: string) {}

  static create(raw: string): ProductCode {
    const value = (raw ?? '').trim();
    if (!FORMAT.test(value)) {
      throw new ValidationError('El código debe tener 2 dígitos, del 10 al 99', 'INVALID_PRODUCT_CODE', {
        code: raw,
      });
    }
    return new ProductCode(value);
  }

  static get assignmentOrder(): readonly string[] {
    return ASSIGNMENT_ORDER;
  }

  /** El primer código libre según el orden de asignación, o null si ya están todos ocupados. */
  static firstFree(taken: Iterable<string>): ProductCode | null {
    const used = new Set(taken);
    const free = ASSIGNMENT_ORDER.find((code) => !used.has(code));
    return free ? new ProductCode(free) : null;
  }
}
