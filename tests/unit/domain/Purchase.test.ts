import { describe, expect, it } from 'vitest';
import { Money, PeriodClosedError, Purchase, PurchaseItem, Quantity } from '../../../domain';
import { admin, LATER, makeClosedPeriod, makeItem, makeOpenPeriod, NOW } from './fixtures';

function registerSample(period = makeOpenPeriod()) {
  return Purchase.register({
    id: 'pur-1',
    period,
    buyerId: 'emp-1',
    store: ' Éxito ',
    purchasedAt: NOW,
    items: [makeItem('i1', 'gaseosa', 12, '2500'), makeItem('i2', 'yogur', 6, '3000')],
    registeredBy: admin.id,
    now: NOW,
  });
}

describe('PurchaseItem', () => {
  it('calcula el subtotal como cantidad × precio unitario', () => {
    const item = makeItem('i1', 'gaseosa', 12, '2500.50');
    expect(item.quantity).toBe(12);
    expect(item.subtotal.toDecimalString()).toBe('30006.00');
  });

  it('acepta precio 0 (producto regalado en la compra) pero no negativo', () => {
    expect(makeItem('i1', 'p', 1, '0').subtotal.isZero()).toBe(true);
    expect(() =>
      PurchaseItem.create({
        id: 'i',
        productId: 'p',
        quantity: Quantity.create(1),
        unitPrice: Money.fromDecimal('-1'),
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_PRICE' }));
  });
});

describe('Purchase', () => {
  it('calcula el total a partir de sus líneas', () => {
    const purchase = registerSample();
    expect(purchase.total.toDecimalString()).toBe('48000.00');
    expect(purchase.items).toHaveLength(2);
    expect(purchase.store).toBe('Éxito');
    expect(purchase.periodId).toBe('period-1');
    expect(purchase.buyerId).toBe('emp-1');
    expect(purchase.receiptPath).toBeNull();
    expect(purchase.isVoided()).toBe(false);
  });

  it('exige al menos una línea', () => {
    expect(() =>
      Purchase.register({
        id: 'p',
        period: makeOpenPeriod(),
        buyerId: 'u',
        purchasedAt: NOW,
        items: [],
        registeredBy: 'a',
        now: NOW,
      }),
    ).toThrow(expect.objectContaining({ code: 'EMPTY_PURCHASE' }));
  });

  it('no permite el mismo producto dos veces', () => {
    expect(() =>
      Purchase.register({
        id: 'p',
        period: makeOpenPeriod(),
        buyerId: 'u',
        purchasedAt: NOW,
        items: [makeItem('i1', 'gaseosa', 1, '100'), makeItem('i2', 'gaseosa', 2, '100')],
        registeredBy: 'a',
        now: NOW,
      }),
    ).toThrow(expect.objectContaining({ code: 'DUPLICATE_PRODUCT' }));
  });

  it('no se puede registrar en una quincena cerrada', () => {
    expect(() => registerSample(makeClosedPeriod())).toThrow(PeriodClosedError);
  });

  it('se anula una sola vez y queda registrado quién y cuándo', () => {
    const period = makeOpenPeriod();
    const purchase = registerSample(period);
    purchase.void({ period, voidedBy: admin.id, now: LATER });
    expect(purchase.isVoided()).toBe(true);
    expect(purchase.voidedAt).toBe(LATER);
    expect(purchase.voidedBy).toBe(admin.id);
    expect(() => purchase.void({ period, voidedBy: admin.id, now: LATER })).toThrow(
      expect.objectContaining({ code: 'PURCHASE_ALREADY_VOIDED' }),
    );
  });

  it('no se puede anular si la quincena ya cerró', () => {
    const period = makeOpenPeriod();
    const purchase = registerSample(period);
    period.close(LATER);
    expect(() => purchase.void({ period, voidedBy: admin.id, now: LATER })).toThrow(PeriodClosedError);
    expect(purchase.isVoided()).toBe(false);
  });

  it('la quincena entregada debe ser la de la compra', () => {
    const purchase = registerSample();
    expect(() => purchase.void({ period: makeOpenPeriod('otra'), voidedBy: admin.id, now: LATER })).toThrow(
      expect.objectContaining({ code: 'PERIOD_MISMATCH' }),
    );
  });

  it('restore no comparte el arreglo de líneas', () => {
    const original = registerSample();
    const items = [...original.items];
    const restored = Purchase.restore({
      id: original.id,
      periodId: original.periodId,
      buyerId: original.buyerId,
      store: original.store,
      purchasedAt: original.purchasedAt,
      items,
      receiptPath: 'uploads/r.jpg',
      note: null,
      registeredBy: original.registeredBy,
      voidedAt: null,
      voidedBy: null,
      createdAt: original.createdAt,
    });
    items.pop();
    expect(restored.items).toHaveLength(2);
    expect(restored.receiptPath).toBe('uploads/r.jpg');
    expect(restored.total.equals(original.total)).toBe(true);
  });
});
