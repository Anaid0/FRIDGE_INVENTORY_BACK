import { describe, expect, it } from 'vitest';
import {
  Category,
  InsufficientStockError,
  Product,
  ProductCode,
  Quantity,
  ValidationError,
} from '../../../domain';
import { LATER, makeProduct, NOW } from './fixtures';

describe('Quantity', () => {
  it('acepta enteros positivos', () => {
    expect(Quantity.create(3).value).toBe(3);
    expect(Quantity.create(3).equals(Quantity.create(3))).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, 4_294_967_296])('rechaza %d', (value) => {
    expect(() => Quantity.create(value)).toThrow(expect.objectContaining({ code: 'INVALID_QUANTITY' }));
  });
});

describe('Category', () => {
  it('se crea y renombra validando el nombre', () => {
    const category = Category.create({ id: 'c1', name: ' Bebidas ', now: NOW });
    expect(category.name).toBe('Bebidas');
    expect(category.createdAt).toBe(NOW);
    category.rename('Lácteos');
    expect(category.name).toBe('Lácteos');
    expect(() => category.rename('')).toThrow(ValidationError);
    expect(Category.restore({ id: 'c1', name: 'X', createdAt: NOW }).id).toBe('c1');
  });
});

describe('Product', () => {
  it('empieza sin stock, activo y con valores por defecto', () => {
    const product = Product.create({ id: 'p1', name: ' Yogur ', now: NOW });
    expect(product.name).toBe('Yogur');
    expect(product.quantity).toBe(0);
    expect(product.unit).toBe('unidad');
    expect(product.minStock).toBe(0);
    expect(product.description).toBeNull();
    expect(product.categoryId).toBeNull();
    expect(product.isActive).toBe(true);
    expect(product.createdAt).toBe(NOW);
  });

  it('valida sus datos', () => {
    expect(() => Product.create({ id: 'p1', name: '', now: NOW })).toThrow(ValidationError);
    expect(() => Product.create({ id: 'p1', name: 'X', minStock: -1, now: NOW })).toThrow(ValidationError);
    expect(() => Product.create({ id: 'p1', name: 'X', unit: 'x'.repeat(21), now: NOW })).toThrow(
      ValidationError,
    );
  });

  it('addStock suma y devuelve el antes/después', () => {
    const product = makeProduct(10);
    const change = product.addStock(Quantity.create(5), LATER);
    expect(change).toEqual({ before: 10, after: 15 });
    expect(product.quantity).toBe(15);
    expect(product.updatedAt).toBe(LATER);
  });

  it('removeStock resta y devuelve el antes/después', () => {
    const product = makeProduct(10);
    expect(product.removeStock(Quantity.create(10), LATER)).toEqual({ before: 10, after: 0 });
    expect(product.quantity).toBe(0);
  });

  it('removeStock no permite dejar el stock en negativo', () => {
    const product = makeProduct(2);
    expect(() => product.removeStock(Quantity.create(3), LATER)).toThrow(InsufficientStockError);
    expect(product.quantity).toBe(2);
  });

  it('un producto desactivado no admite movimientos', () => {
    const product = makeProduct(5);
    product.deactivate(LATER);
    expect(product.isActive).toBe(false);
    expect(() => product.addStock(Quantity.create(1), LATER)).toThrow(
      expect.objectContaining({ code: 'PRODUCT_INACTIVE' }),
    );
    expect(() => product.removeStock(Quantity.create(1), LATER)).toThrow(
      expect.objectContaining({ code: 'PRODUCT_INACTIVE' }),
    );
    product.activate(LATER);
    expect(product.removeStock(Quantity.create(1), LATER).after).toBe(4);
  });

  it('isLowStock compara con el stock mínimo', () => {
    expect(makeProduct(2).isLowStock()).toBe(true); // minStock = 2
    expect(makeProduct(3).isLowStock()).toBe(false);
  });

  it('updateDetails cambia los datos pero no el stock', () => {
    const product = makeProduct(7);
    product.updateDetails(
      { name: 'Gaseosa 400ml', description: 'Fría', unit: 'botella', minStock: 5, categoryId: 'c1' },
      LATER,
    );
    expect(product.name).toBe('Gaseosa 400ml');
    expect(product.description).toBe('Fría');
    expect(product.unit).toBe('botella');
    expect(product.minStock).toBe(5);
    expect(product.categoryId).toBe('c1');
    expect(product.quantity).toBe(7);
    expect(product.updatedAt).toBe(LATER);
  });

  it('restore conserva el stock persistido', () => {
    const product = Product.restore({
      id: 'p1',
      name: 'Agua',
      description: null,
      unit: 'botella',
      quantity: 9,
      minStock: 1,
      categoryId: null,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(product.quantity).toBe(9);
    expect(product.id).toBe('p1');
  });
});

describe('ProductCode', () => {
  it.each(['10', '11', '57', '99', ' 42 '])('acepta %s', (raw) => {
    expect(ProductCode.create(raw).value).toBe(raw.trim());
  });

  it.each(['', '1', '05', '00', '100', 'ab', '1a', '9 9'])('rechaza "%s"', (raw) => {
    expect(() => ProductCode.create(raw)).toThrow(
      expect.objectContaining({
        code: 'INVALID_PRODUCT_CODE',
        message: 'El código debe tener 2 dígitos, del 10 al 99',
      }),
    );
  });

  it('se reparte en filas de 4 como la máquina: 11-14 … 91-94, luego 15-19 … 95-99, luego 10 … 90', () => {
    const order = ProductCode.assignmentOrder;
    expect(order).toHaveLength(90);
    expect(new Set(order).size).toBe(90);
    expect(order.slice(0, 9)).toEqual(['11', '12', '13', '14', '21', '22', '23', '24', '31']);
    expect(order.slice(32, 42)).toEqual(['91', '92', '93', '94', '15', '16', '17', '18', '19', '25']);
    expect(order.slice(76, 81)).toEqual(['95', '96', '97', '98', '99']);
    expect(order.slice(81)).toEqual(['10', '20', '30', '40', '50', '60', '70', '80', '90']);
  });

  it('firstFree devuelve el primer código libre en ese orden, o null si no queda ninguno', () => {
    expect(ProductCode.firstFree([])?.value).toBe('11');
    expect(ProductCode.firstFree(['11', '12', '14'])?.value).toBe('13');
    expect(ProductCode.firstFree(ProductCode.assignmentOrder.slice(0, 36))?.value).toBe('15');
    expect(ProductCode.firstFree(ProductCode.assignmentOrder.filter((c) => c !== '10'))?.value).toBe('10');
    expect(ProductCode.firstFree(ProductCode.assignmentOrder)).toBeNull();
  });
});

describe('Product: código del teclado', () => {
  it('es opcional al crear (lo asigna el caso de uso) y se valida si viene', () => {
    expect(Product.create({ id: 'p1', name: 'Yogur', now: NOW }).code).toBeNull();
    expect(Product.create({ id: 'p1', name: 'Yogur', code: '23', now: NOW }).code).toBe('23');
    expect(() => Product.create({ id: 'p1', name: 'Yogur', code: '5', now: NOW })).toThrow(
      expect.objectContaining({ code: 'INVALID_PRODUCT_CODE' }),
    );
  });

  it('assignCode valida el código y actualiza la fecha', () => {
    const product = makeProduct();
    product.assignCode('31', LATER);
    expect(product.code).toBe('31');
    expect(product.updatedAt).toBe(LATER);
    expect(() => product.assignCode('100', LATER)).toThrow(ValidationError);
    expect(product.code).toBe('31');
  });

  it('updateDetails conserva o cambia el código', () => {
    const product = makeProduct(0, { code: '11' });
    product.updateDetails({ name: 'Gaseosa', code: '12' }, LATER);
    expect(product.code).toBe('12');
  });
});
