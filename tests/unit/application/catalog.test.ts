import { describe, expect, it } from 'vitest';
import {
  CreateCategoryUseCase,
  CreateProductUseCase,
  GetProductUseCase,
  ListCategoriesUseCase,
  ListProductsUseCase,
  RegisterStockOutUseCase,
  UpdateProductUseCase,
} from '../../../application';
import { ProductCode } from '../../../domain';
import { createOfficeContext } from '../../support/testContext';

async function setup() {
  const ctx = await createOfficeContext();
  const { repos, ids, clock, uow, recorder } = ctx;
  return {
    ...ctx,
    createCategory: new CreateCategoryUseCase(repos.categories, ids, clock),
    listCategories: new ListCategoriesUseCase(repos.categories),
    createProduct: new CreateProductUseCase(uow, repos.categories, recorder, ids, clock),
    updateProduct: new UpdateProductUseCase(repos.products, repos.categories, clock),
    listProducts: new ListProductsUseCase(repos.products, repos.purchases, clock),
    getProduct: new GetProductUseCase(repos.products, repos.movements),
    stockOut: new RegisterStockOutUseCase(uow, recorder, clock),
  };
}

describe('Categorías', () => {
  it('el admin crea categorías y cualquiera las lista ordenadas', async () => {
    const { createCategory, listCategories, asAdmin } = await setup();
    await createCategory.execute({ name: 'Snacks' }, asAdmin);
    await createCategory.execute({ name: ' Bebidas ' }, asAdmin);
    expect((await listCategories.execute()).map((c) => c.name)).toEqual(['Bebidas', 'Snacks']);
  });

  it('no permite nombres repetidos (sin importar mayúsculas) ni que un empleado cree', async () => {
    const { createCategory, asAdmin, asAna } = await setup();
    await createCategory.execute({ name: 'Bebidas' }, asAdmin);
    await expect(createCategory.execute({ name: 'BEBIDAS' }, asAdmin)).rejects.toMatchObject({
      code: 'CATEGORY_NAME_TAKEN',
    });
    await expect(createCategory.execute({ name: 'Frutas' }, asAna)).rejects.toMatchObject({
      kind: 'FORBIDDEN',
    });
  });
});

describe('CreateProductUseCase', () => {
  it('crea un producto sin stock', async () => {
    const { createProduct, asAdmin, db } = await setup();
    const dto = await createProduct.execute({ name: 'Gaseosa', minStock: 3 }, asAdmin);
    expect(dto).toMatchObject({
      name: 'Gaseosa',
      quantity: 0,
      minStock: 3,
      isLowStock: true,
      unit: 'unidad',
    });
    expect(db.movements).toHaveLength(0);
  });

  it('con stock inicial registra una entrada a nombre del admin', async () => {
    const { createProduct, asAdmin, db } = await setup();
    const dto = await createProduct.execute({ name: 'Agua', initialQuantity: 12 }, asAdmin);
    expect(dto.quantity).toBe(12);
    expect(db.movements).toHaveLength(1);
    expect(db.movements[0]).toMatchObject({
      type: 'IN',
      source: 'MANUAL',
      quantity: 12,
      performedBy: asAdmin.id,
      registeredBy: asAdmin.id,
      note: 'Stock inicial',
    });
  });

  it('valida nombre único, categoría existente y permisos', async () => {
    const { createProduct, seedProduct, asAdmin, asAna } = await setup();
    await seedProduct('Gaseosa');
    await expect(createProduct.execute({ name: 'gaseosa' }, asAdmin)).rejects.toMatchObject({
      code: 'PRODUCT_NAME_TAKEN',
    });
    await expect(
      createProduct.execute({ name: 'Yogur', categoryId: 'no-existe' }, asAdmin),
    ).rejects.toMatchObject({
      code: 'CATEGORY_NOT_FOUND',
    });
    await expect(createProduct.execute({ name: 'Yogur' }, asAna)).rejects.toMatchObject({
      kind: 'FORBIDDEN',
    });
  });
});

describe('UpdateProductUseCase', () => {
  it('edita los datos sin tocar el stock', async () => {
    const { updateProduct, seedProduct, seedCategory, asAdmin } = await setup();
    const product = await seedProduct('Gaseosa', { stock: 7 });
    const category = await seedCategory('Bebidas');
    const dto = await updateProduct.execute(
      product.id,
      { name: 'Gaseosa 400ml', unit: 'botella', minStock: 2, categoryId: category.id, description: 'Fría' },
      asAdmin,
    );
    expect(dto).toMatchObject({ name: 'Gaseosa 400ml', unit: 'botella', minStock: 2, quantity: 7 });
    expect(dto.categoryId).toBe(category.id);

    const cleared = await updateProduct.execute(product.id, { categoryId: null, description: null }, asAdmin);
    expect(cleared.categoryId).toBeNull();
    expect(cleared.description).toBeNull();
  });

  it('desactiva y reactiva un producto', async () => {
    const { updateProduct, seedProduct, asAdmin } = await setup();
    const product = await seedProduct('Gaseosa');
    expect((await updateProduct.execute(product.id, { isActive: false }, asAdmin)).isActive).toBe(false);
    expect((await updateProduct.execute(product.id, { isActive: true }, asAdmin)).isActive).toBe(true);
  });

  it('no permite renombrar a un nombre ya usado por otro producto', async () => {
    const { updateProduct, seedProduct, asAdmin } = await setup();
    const gaseosa = await seedProduct('Gaseosa');
    await seedProduct('Yogur');
    await expect(updateProduct.execute(gaseosa.id, { name: 'YOGUR' }, asAdmin)).rejects.toMatchObject({
      code: 'PRODUCT_NAME_TAKEN',
    });
    // renombrarse a sí mismo (otra capitalización) sí se permite
    expect((await updateProduct.execute(gaseosa.id, { name: 'GASEOSA' }, asAdmin)).name).toBe('GASEOSA');
  });

  it('falla con producto o categoría inexistente', async () => {
    const { updateProduct, seedProduct, asAdmin } = await setup();
    await expect(updateProduct.execute('nope', { name: 'X' }, asAdmin)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
    const product = await seedProduct('Gaseosa');
    await expect(updateProduct.execute(product.id, { categoryId: 'nope' }, asAdmin)).rejects.toMatchObject({
      code: 'CATEGORY_NOT_FOUND',
    });
  });
});

describe('ListProductsUseCase / GetProductUseCase', () => {
  it('filtra por búsqueda, categoría, stock bajo y oculta inactivos por defecto', async () => {
    const { listProducts, seedProduct, seedCategory } = await setup();
    const bebidas = await seedCategory('Bebidas');
    await seedProduct('Gaseosa', { stock: 1, minStock: 2, categoryId: bebidas.id });
    await seedProduct('Agua', { stock: 10, minStock: 2, categoryId: bebidas.id });
    await seedProduct('Yogur', { stock: 5 });
    await seedProduct('Viejo', { isActive: false });

    const names = async (filter = {}) => (await listProducts.execute(filter)).map((p) => p.name);
    expect(await names()).toEqual(['Agua', 'Gaseosa', 'Yogur']);
    expect(await names({ includeInactive: true })).toContain('Viejo');
    expect(await names({ search: 'gas' })).toEqual(['Gaseosa']);
    expect(await names({ categoryId: bebidas.id })).toEqual(['Agua', 'Gaseosa']);
    expect(await names({ lowStock: true })).toEqual(['Gaseosa']);
  });

  it('el detalle trae los últimos movimientos del producto', async () => {
    const { getProduct, stockOut, seedProduct, asAna } = await setup();
    const product = await seedProduct('Gaseosa', { stock: 5 });
    await stockOut.execute({ productId: product.id, quantity: 2 }, asAna);
    const detail = await getProduct.execute(product.id);
    expect(detail.product.quantity).toBe(3);
    expect(detail.latestMovements).toHaveLength(1);
    expect(detail.latestMovements[0]).toMatchObject({
      type: 'OUT',
      quantity: 2,
      performedBy: { name: 'Ana' },
    });
    await expect(getProduct.execute('nope')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });
});

describe('Código del teclado de los productos', () => {
  it('sin código, asigna el primero libre en filas de 4 (11-14, 21-24…)', async () => {
    const { createProduct, asAdmin } = await setup();
    const codes = [];
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
      codes.push((await createProduct.execute({ name, code: null }, asAdmin)).code);
    }
    expect(codes).toEqual(['11', '12', '13', '14', '21', '22']);
  });

  it('salta los códigos ocupados (también los de productos inactivos) y rellena huecos', async () => {
    const { createProduct, seedProduct, asAdmin } = await setup();
    await seedProduct('Viejo', { code: '11', isActive: false });
    await seedProduct('Agua', { code: '13' });
    expect((await createProduct.execute({ name: 'Yogur' }, asAdmin)).code).toBe('12');
    expect((await createProduct.execute({ name: 'Papas' }, asAdmin)).code).toBe('14');
  });

  it('después de 91-94 sigue con 15-19 y al final 10, 20 … 90; si no queda ninguno, falla', async () => {
    const { createProduct, seedProduct, asAdmin } = await setup();
    for (const code of ProductCode.assignmentOrder.slice(0, 36)) await seedProduct(`P${code}`, { code });
    expect((await createProduct.execute({ name: 'Nuevo 1' }, asAdmin)).code).toBe('15');
    for (const code of ProductCode.assignmentOrder.slice(37, 81)) await seedProduct(`P${code}`, { code });
    expect((await createProduct.execute({ name: 'Nuevo 2' }, asAdmin)).code).toBe('10');
    for (const code of ProductCode.assignmentOrder.slice(82)) await seedProduct(`P${code}`, { code });
    await expect(createProduct.execute({ name: 'Nuevo 3' }, asAdmin)).rejects.toMatchObject({
      code: 'NO_PRODUCT_CODE_AVAILABLE',
    });
  });

  it('acepta un código elegido; si ya lo tiene otro producto (activo o no) da conflicto', async () => {
    const { createProduct, seedProduct, asAdmin, db } = await setup();
    expect((await createProduct.execute({ name: 'Agua', code: '57' }, asAdmin)).code).toBe('57');
    const viejo = await seedProduct('Viejo', { code: '42', isActive: false });
    await expect(createProduct.execute({ name: 'Yogur', code: '42' }, asAdmin)).rejects.toMatchObject({
      kind: 'CONFLICT',
      code: 'PRODUCT_CODE_TAKEN',
      message: 'El código 42 ya lo tiene Viejo',
      details: { code: '42', productId: viejo.id },
    });
    await expect(createProduct.execute({ name: 'Yogur', code: '05' }, asAdmin)).rejects.toMatchObject({
      code: 'INVALID_PRODUCT_CODE',
    });
    expect([...db.products.values()].map((p) => p.name).sort()).toEqual(['Agua', 'Viejo']);
  });

  it('al editar se puede cambiar el código, pero no a uno ocupado; repetir el propio sí', async () => {
    const { updateProduct, seedProduct, asAdmin } = await setup();
    const gaseosa = await seedProduct('Gaseosa', { code: '11' });
    const yogur = await seedProduct('Yogur', { code: '12' });
    expect((await updateProduct.execute(gaseosa.id, { code: '11' }, asAdmin)).code).toBe('11');
    expect((await updateProduct.execute(gaseosa.id, { code: '35' }, asAdmin)).code).toBe('35');
    await expect(updateProduct.execute(gaseosa.id, { code: '12' }, asAdmin)).rejects.toMatchObject({
      code: 'PRODUCT_CODE_TAKEN',
      message: 'El código 12 ya lo tiene Yogur',
      details: { code: '12', productId: yogur.id },
    });
    await expect(updateProduct.execute(gaseosa.id, { code: '9' }, asAdmin)).rejects.toMatchObject({
      code: 'INVALID_PRODUCT_CODE',
    });
    // Editar otros datos conserva el código
    expect((await updateProduct.execute(gaseosa.id, { minStock: 4 }, asAdmin)).code).toBe('35');
  });

  it('la lista incluye el código y se puede buscar por código o por nombre', async () => {
    const { listProducts, seedProduct } = await setup();
    await seedProduct('Gaseosa', { code: '11' });
    await seedProduct('Yogur', { code: '21' });
    expect((await listProducts.execute()).map((p) => [p.name, p.code])).toEqual([
      ['Gaseosa', '11'],
      ['Yogur', '21'],
    ]);
    expect((await listProducts.execute({ search: '21' })).map((p) => p.name)).toEqual(['Yogur']);
    expect((await listProducts.execute({ search: 'gase' })).map((p) => p.name)).toEqual(['Gaseosa']);
  });
});
