import { describe, expect, it } from 'vitest';
import { Category, InsufficientStockError, Product, Quantity, ValidationError } from '../../../domain';
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
