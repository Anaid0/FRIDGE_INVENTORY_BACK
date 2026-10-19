/** Resultado de un cambio de stock; se registra en el movimiento de inventario. */
export interface StockChange {
  before: number;
  after: number;
}
