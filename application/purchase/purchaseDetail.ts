import type { ProductRepository, Purchase, UserRepository } from '../../domain';
import { toUserRef, type PurchaseDetailDto } from '../dto';
import { getProductOrFail, getUserOrFail } from '../shared/loaders';

/** Arma el detalle de una compra con los nombres de usuarios y productos resueltos. */
export async function buildPurchaseDetail(
  purchase: Purchase,
  repos: { users: UserRepository; products: ProductRepository },
): Promise<PurchaseDetailDto> {
  const [buyer, registrar, voider] = await Promise.all([
    getUserOrFail(repos.users, purchase.buyerId),
    getUserOrFail(repos.users, purchase.registeredBy),
    purchase.voidedBy ? getUserOrFail(repos.users, purchase.voidedBy) : Promise.resolve(null),
  ]);

  const items = await Promise.all(
    purchase.items.map(async (item) => {
      const product = await getProductOrFail(repos.products, item.productId);
      return {
        id: item.id,
        product: { id: product.id, name: product.name, unit: product.unit },
        quantity: item.quantity,
        unitPrice: item.unitPrice.toDecimalString(),
        subtotal: item.subtotal.toDecimalString(),
      };
    }),
  );

  return {
    id: purchase.id,
    periodId: purchase.periodId,
    buyer: toUserRef(buyer),
    registeredBy: toUserRef(registrar),
    voidedBy: voider ? toUserRef(voider) : null,
    store: purchase.store,
    purchasedAt: purchase.purchasedAt,
    total: purchase.total.toDecimalString(),
    hasReceipt: purchase.receiptPath !== null,
    note: purchase.note,
    voidedAt: purchase.voidedAt,
    createdAt: purchase.createdAt,
    items,
  };
}
