import { describe, expect, it } from 'vitest';
import {
  InventoryMovement,
  Money,
  MovementActorPolicy,
  MovementSource,
  MovementType,
  Quantity,
  ValidationError,
} from '../../../domain';
import { admin, employee, makeProduct, NOW } from './fixtures';

describe('MovementActorPolicy', () => {
  it('el admin puede registrar a nombre de otra persona', () => {
    expect(MovementActorPolicy.canChoosePerformer(admin)).toBe(true);
    expect(MovementActorPolicy.resolvePerformedBy(admin, 'emp-2')).toBe('emp-2');
  });

  it('si el admin no elige a nadie, queda a su nombre', () => {
    expect(MovementActorPolicy.resolvePerformedBy(admin)).toBe(admin.id);
    expect(MovementActorPolicy.resolvePerformedBy(admin, null)).toBe(admin.id);
  });

  it('un empleado siempre queda a su propio nombre aunque envíe otro', () => {
    expect(MovementActorPolicy.canChoosePerformer(employee)).toBe(false);
    expect(MovementActorPolicy.resolvePerformedBy(employee, 'otra-persona')).toBe(employee.id);
  });
});

describe('InventoryMovement', () => {
  const base = { id: 'm1', productId: 'prod-1', performedBy: 'emp-1', registeredBy: 'emp-1', now: NOW };

  it('registra una salida con el stock antes y después', () => {
    const product = makeProduct(10);
    const quantity = Quantity.create(3);
    const movement = InventoryMovement.record({
      ...base,
      type: MovementType.OUT,
      quantity,
      stockChange: product.removeStock(quantity, NOW),
      note: '  para el almuerzo ',
    });
    expect(movement.type).toBe('OUT');
    expect(movement.quantity).toBe(3);
    expect(movement.stockBefore).toBe(10);
    expect(movement.stockAfter).toBe(7);
    expect(movement.note).toBe('para el almuerzo');
    expect(movement.purchaseItemId).toBeNull();
    expect(movement.source).toBe('MANUAL');
    expect(movement.isWithdrawal()).toBe(true);
    expect(movement.createdAt).toBe(NOW);
    expect(movement.wasRegisteredOnBehalf()).toBe(false);
  });

  it('distingue quién realizó el movimiento de quién lo registró', () => {
    const movement = InventoryMovement.record({
      ...base,
      performedBy: 'emp-2',
      registeredBy: 'admin-1',
      type: MovementType.OUT,
      quantity: Quantity.create(1),
      stockChange: { before: 5, after: 4 },
    });
    expect(movement.performedBy).toBe('emp-2');
    expect(movement.registeredBy).toBe('admin-1');
    expect(movement.wasRegisteredOnBehalf()).toBe(true);
  });

  it('una entrada puede venir de una línea de compra', () => {
    const movement = InventoryMovement.record({
      ...base,
      type: MovementType.IN,
      source: MovementSource.PURCHASE,
      quantity: Quantity.create(12),
      stockChange: { before: 0, after: 12 },
      purchaseItemId: 'item-1',
    });
    expect(movement.purchaseItemId).toBe('item-1');
    expect(movement.source).toBe('PURCHASE');
    expect(movement.isWithdrawal()).toBe(false);
    expect(movement.note).toBeNull();
  });

  it('rechaza un cambio de stock que no cuadra con el tipo y la cantidad', () => {
    expect(() =>
      InventoryMovement.record({
        ...base,
        type: MovementType.IN,
        quantity: Quantity.create(2),
        stockChange: { before: 5, after: 3 },
      }),
    ).toThrow(expect.objectContaining({ code: 'INCONSISTENT_MOVEMENT' }));
  });

  it('una salida no puede estar enlazada a una compra', () => {
    expect(() =>
      InventoryMovement.record({
        ...base,
        type: MovementType.OUT,
        quantity: Quantity.create(1),
        stockChange: { before: 5, after: 4 },
        purchaseItemId: 'item-1',
      }),
    ).toThrow(ValidationError);
  });

  it.each([
    ['PURCHASE sin línea de compra', MovementType.IN, MovementSource.PURCHASE, null],
    ['PURCHASE como salida', MovementType.OUT, MovementSource.PURCHASE, 'item-1'],
    ['PURCHASE_VOID como entrada', MovementType.IN, MovementSource.PURCHASE_VOID, null],
    ['MANUAL con línea de compra', MovementType.IN, MovementSource.MANUAL, 'item-1'],
  ] as const)('rechaza un origen incoherente: %s', (_label, type, source, purchaseItemId) => {
    expect(() =>
      InventoryMovement.record({
        ...base,
        type,
        source,
        purchaseItemId,
        quantity: Quantity.create(1),
        stockChange: type === MovementType.IN ? { before: 5, after: 6 } : { before: 5, after: 4 },
      }),
    ).toThrow(expect.objectContaining({ code: 'INCONSISTENT_MOVEMENT' }));
  });

  it('las entradas y salidas manuales guardan su precio; las de compra no (lo toman del ítem)', () => {
    const price = Money.fromDecimal('2500');
    const manualIn = InventoryMovement.record({
      ...base,
      type: MovementType.IN,
      quantity: Quantity.create(2),
      stockChange: { before: 5, after: 7 },
      unitPrice: price,
    });
    const manualOut = InventoryMovement.record({
      ...base,
      type: MovementType.OUT,
      quantity: Quantity.create(1),
      stockChange: { before: 7, after: 6 },
      unitPrice: price,
    });
    const purchaseIn = InventoryMovement.record({
      ...base,
      type: MovementType.IN,
      source: MovementSource.PURCHASE,
      purchaseItemId: 'item-1',
      quantity: Quantity.create(2),
      stockChange: { before: 6, after: 8 },
      unitPrice: price,
    });
    const voidOut = InventoryMovement.record({
      ...base,
      type: MovementType.OUT,
      source: MovementSource.PURCHASE_VOID,
      quantity: Quantity.create(2),
      stockChange: { before: 8, after: 6 },
      unitPrice: price,
    });
    expect(manualIn.unitPrice?.toDecimalString()).toBe('2500.00');
    expect(manualIn.isWithdrawal()).toBe(false);
    expect(manualOut.unitPrice?.toDecimalString()).toBe('2500.00');
    expect(purchaseIn.unitPrice).toBeNull();
    expect(voidOut.unitPrice).toBeNull();
  });

  it('la reversión de una compra es una salida que no cuenta como retiro', () => {
    const movement = InventoryMovement.record({
      ...base,
      type: MovementType.OUT,
      source: MovementSource.PURCHASE_VOID,
      quantity: Quantity.create(2),
      stockChange: { before: 5, after: 3 },
    });
    expect(movement.isWithdrawal()).toBe(false);
  });

  it('restore reconstruye el movimiento', () => {
    const movement = InventoryMovement.restore({
      id: 'm1',
      productId: 'p1',
      type: MovementType.IN,
      source: MovementSource.MANUAL,
      quantity: 2,
      stockBefore: 0,
      stockAfter: 2,
      performedBy: 'u1',
      registeredBy: 'u1',
      note: null,
      purchaseItemId: null,
      createdAt: NOW,
    });
    expect(movement.id).toBe('m1');
    expect(movement.productId).toBe('p1');
  });
});
