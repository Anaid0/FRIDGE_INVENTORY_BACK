import type { FundingPeriod } from '../funding/FundingPeriod';
import { ConflictError, ValidationError } from '../shared/DomainError';
import { Guard } from '../shared/Guard';
import { Money } from '../shared/Money';
import type { PurchaseItem } from './PurchaseItem';

export interface PurchaseProps {
  id: string;
  periodId: string;
  buyerId: string; // quién fue a comprar
  store: string | null;
  purchasedAt: Date;
  items: PurchaseItem[];
  receiptPath: string | null;
  note: string | null;
  registeredBy: string;
  voidedAt: Date | null;
  voidedBy: string | null;
  createdAt: Date;
}

export interface RegisterPurchaseInput {
  id: string;
  period: FundingPeriod;
  buyerId: string;
  store?: string | null;
  purchasedAt: Date;
  items: PurchaseItem[];
  receiptPath?: string | null;
  note?: string | null;
  registeredBy: string;
  now: Date;
}

const STORE_MAX = 120;
const NOTE_MAX = 255;
const RECEIPT_PATH_MAX = 255;

/** Compra hecha con el fondo de una quincena. Agregado raíz de sus líneas. */
export class Purchase {
  private constructor(private props: PurchaseProps) {}

  static register(input: RegisterPurchaseInput): Purchase {
    input.period.assertOpen();
    Purchase.assertValidItems(input.items);

    return new Purchase({
      id: input.id,
      periodId: input.period.id,
      buyerId: input.buyerId,
      store: Guard.optionalText(input.store, 'store', STORE_MAX),
      purchasedAt: Guard.validDate(input.purchasedAt, 'purchasedAt'),
      items: [...input.items],
      receiptPath: Guard.optionalText(input.receiptPath, 'receiptPath', RECEIPT_PATH_MAX),
      note: Guard.optionalText(input.note, 'note', NOTE_MAX),
      registeredBy: input.registeredBy,
      voidedAt: null,
      voidedBy: null,
      createdAt: input.now,
    });
  }

  static restore(props: PurchaseProps): Purchase {
    return new Purchase({ ...props, items: [...props.items] });
  }

  get id(): string {
    return this.props.id;
  }
  get periodId(): string {
    return this.props.periodId;
  }
  get buyerId(): string {
    return this.props.buyerId;
  }
  get store(): string | null {
    return this.props.store;
  }
  get purchasedAt(): Date {
    return this.props.purchasedAt;
  }
  get items(): readonly PurchaseItem[] {
    return this.props.items;
  }
  get receiptPath(): string | null {
    return this.props.receiptPath;
  }
  get note(): string | null {
    return this.props.note;
  }
  get registeredBy(): string {
    return this.props.registeredBy;
  }
  get voidedAt(): Date | null {
    return this.props.voidedAt;
  }
  get voidedBy(): string | null {
    return this.props.voidedBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  get total(): Money {
    return Money.sum(this.props.items.map((item) => item.subtotal));
  }

  isVoided(): boolean {
    return this.props.voidedAt !== null;
  }

  /**
   * Anula la compra. No borra nada: la marca como anulada para excluirla de los totales.
   * La reversión del stock (movimientos OUT) la orquesta el caso de uso.
   */
  void(input: { period: FundingPeriod; voidedBy: string; now: Date }): void {
    if (this.isVoided()) {
      throw new ConflictError('La compra ya fue anulada', 'PURCHASE_ALREADY_VOIDED', {
        purchaseId: this.props.id,
      });
    }
    if (input.period.id !== this.props.periodId) {
      throw new ValidationError('La quincena no corresponde a la compra', 'PERIOD_MISMATCH', {
        purchaseId: this.props.id,
      });
    }
    input.period.assertOpen();
    this.props.voidedAt = input.now;
    this.props.voidedBy = input.voidedBy;
  }

  private static assertValidItems(items: readonly PurchaseItem[]): void {
    if (items.length === 0) {
      throw new ValidationError('La compra debe tener al menos un producto', 'EMPTY_PURCHASE');
    }
    const productIds = new Set<string>();
    for (const item of items) {
      if (productIds.has(item.productId)) {
        throw new ValidationError(
          'Un producto no puede aparecer dos veces en la misma compra',
          'DUPLICATE_PRODUCT',
          {
            productId: item.productId,
          },
        );
      }
      productIds.add(item.productId);
    }
  }
}
