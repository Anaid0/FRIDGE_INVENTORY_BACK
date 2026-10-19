/**
 * Origen de un movimiento:
 * - MANUAL: alguien sacó/metió productos (las salidas MANUAL son las que cuentan en el ranking).
 * - PURCHASE: entrada generada al registrar una compra.
 * - PURCHASE_VOID: salida generada al anular una compra (reversión, no es consumo).
 */
export const MovementSource = {
  MANUAL: 'MANUAL',
  PURCHASE: 'PURCHASE',
  PURCHASE_VOID: 'PURCHASE_VOID',
} as const;

export type MovementSource = (typeof MovementSource)[keyof typeof MovementSource];
