import {
  Money,
  MovementSource,
  MovementType,
  NotFoundError,
  Purchase,
  PurchaseItem,
  Quantity,
  type Actor,
  type Page,
  type ProductRepository,
  type PurchaseFilter,
  type PurchaseRepository,
  type UserRepository,
} from '../../domain';
import { toPurchaseListItemDto, type PurchaseDetailDto, type PurchaseListItemDto } from '../dto';
import type { StockMovementRecorder } from '../movement/StockMovementRecorder';
import type { Clock, FileStorage, FileToStore, IdGenerator, UnitOfWork } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { getActiveUserOrFail, getPeriodOrFail, getProductOrFail } from '../shared/loaders';
import { toPageRequest } from '../shared/pagination';
import { buildPurchaseDetail } from './purchaseDetail';
import { assertValidReceipt } from './ReceiptPolicy';

const RECEIPTS_FOLDER = 'receipts';

async function getPurchaseOrFail(purchases: PurchaseRepository, id: string): Promise<Purchase> {
  const purchase = await purchases.findById(id);
  if (!purchase) throw new NotFoundError('Compra no encontrada', 'PURCHASE_NOT_FOUND', { id });
  return purchase;
}

export interface RegisterPurchaseInput {
  periodId: string;
  buyerId: string;
  store?: string | null;
  purchasedAt: Date;
  note?: string | null;
  items: { productId: string; quantity: number; unitPrice: string | number }[];
  receipt?: FileToStore | null;
}

/**
 * Registra una compra hecha con el fondo de la quincena y mete sus productos a la nevera:
 * todo en una sola transacción (compra + líneas + stock + un movimiento IN por línea).
 */
export class RegisterPurchaseUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly recorder: StockMovementRecorder,
    private readonly storage: FileStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterPurchaseInput, actor: Actor): Promise<PurchaseDetailDto> {
    requireAdmin(actor);
    if (input.receipt) assertValidReceipt(input.receipt);

    // Validar las líneas antes de tocar el almacenamiento o la base de datos.
    const items = input.items.map((item) =>
      PurchaseItem.create({
        id: this.ids.generate(),
        productId: item.productId,
        quantity: Quantity.create(item.quantity),
        unitPrice: Money.fromDecimal(item.unitPrice),
      }),
    );

    const receiptPath = input.receipt ? await this.storage.save(RECEIPTS_FOLDER, input.receipt) : null;
    try {
      return await this.uow.run(async (repos) => {
        const period = await getPeriodOrFail(repos.periods, input.periodId);
        await getActiveUserOrFail(repos.users, input.buyerId);
        // Verificar los productos antes de insertar las líneas (que tienen FK a products).
        for (const item of items) await getProductOrFail(repos.products, item.productId);
        const now = this.clock.now();

        const purchase = Purchase.register({
          id: this.ids.generate(),
          period,
          buyerId: input.buyerId,
          store: input.store,
          purchasedAt: input.purchasedAt,
          items,
          receiptPath,
          note: input.note,
          registeredBy: actor.id,
          now,
        });
        await repos.purchases.save(purchase);

        const note = purchase.store ? `Compra en ${purchase.store}` : 'Compra del fondo';
        for (const item of purchase.items) {
          await this.recorder.record(repos, {
            productId: item.productId,
            type: MovementType.IN,
            source: MovementSource.PURCHASE,
            quantity: Quantity.create(item.quantity),
            performedBy: purchase.buyerId,
            registeredBy: actor.id,
            purchaseItemId: item.id,
            note,
            now,
          });
        }

        return buildPurchaseDetail(purchase, repos);
      });
    } catch (error) {
      // Compensación: la transacción se revirtió, el archivo no debe quedar huérfano.
      if (receiptPath) await this.storage.delete(receiptPath).catch(() => undefined);
      throw error;
    }
  }
}

/**
 * Anula una compra: la marca como anulada (deja de contar en el gasto) y saca de la nevera
 * lo que había entrado, con movimientos PURCHASE_VOID que no cuentan en el ranking.
 * Falla si ya se consumió parte de lo comprado (no hay stock para revertir).
 */
export class VoidPurchaseUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly recorder: StockMovementRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(purchaseId: string, actor: Actor): Promise<PurchaseDetailDto> {
    requireAdmin(actor);
    return this.uow.run(async (repos) => {
      const purchase = await getPurchaseOrFail(repos.purchases, purchaseId);
      const period = await getPeriodOrFail(repos.periods, purchase.periodId);
      const now = this.clock.now();

      purchase.void({ period, voidedBy: actor.id, now });
      await repos.purchases.save(purchase);

      for (const item of purchase.items) {
        await this.recorder.record(repos, {
          productId: item.productId,
          type: MovementType.OUT,
          source: MovementSource.PURCHASE_VOID,
          quantity: Quantity.create(item.quantity),
          performedBy: actor.id,
          registeredBy: actor.id,
          note: 'Anulación de compra',
          now,
        });
      }

      return buildPurchaseDetail(purchase, repos);
    });
  }
}

export interface ListPurchasesInput extends PurchaseFilter {
  page?: number;
  pageSize?: number;
}

export class ListPurchasesUseCase {
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(input: ListPurchasesInput): Promise<Page<PurchaseListItemDto>> {
    const { page, pageSize, ...filter } = input;
    const result = await this.purchases.findPage(filter, toPageRequest(page, pageSize));
    return { ...result, items: result.items.map(toPurchaseListItemDto) };
  }
}

export class GetPurchaseUseCase {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly users: UserRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(purchaseId: string): Promise<PurchaseDetailDto> {
    const purchase = await getPurchaseOrFail(this.purchases, purchaseId);
    return buildPurchaseDetail(purchase, { users: this.users, products: this.products });
  }
}

export interface ReceiptFile {
  content: Uint8Array;
  mimeType: string;
  fileName: string;
}

export class GetPurchaseReceiptUseCase {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(purchaseId: string): Promise<ReceiptFile> {
    const purchase = await getPurchaseOrFail(this.purchases, purchaseId);
    if (!purchase.receiptPath) {
      throw new NotFoundError('La compra no tiene comprobante', 'RECEIPT_NOT_FOUND', { purchaseId });
    }
    const file = await this.storage.read(purchase.receiptPath);
    const extension = purchase.receiptPath.split('.').pop() ?? 'bin';
    return { ...file, fileName: `comprobante-${purchase.id}.${extension}` };
  }
}
