import {
  ConflictError,
  MovementType,
  NotFoundError,
  Money,
  Product,
  ProductCode,
  Quantity,
  type Actor,
  type CategoryRepository,
  type MovementRepository,
  type MovementView,
  type ProductFilter,
  type ProductRepository,
  type PurchaseRepository,
} from '../../domain';
import { toProductDto, type ProductDto } from '../dto';
import type { StockMovementRecorder } from '../movement/StockMovementRecorder';
import type { Clock, IdGenerator, UnitOfWork } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { getProductOrFail } from '../shared/loaders';

async function assertCategoryExists(categories: CategoryRepository, categoryId: string | null | undefined) {
  if (categoryId && !(await categories.findById(categoryId))) {
    throw new NotFoundError('Categoría no encontrada', 'CATEGORY_NOT_FOUND', { id: categoryId });
  }
}

function nameTaken(name: string) {
  return new ConflictError('Ya existe un producto con ese nombre', 'PRODUCT_NAME_TAKEN', { name });
}

/** En el teclado de la tablet el código es lo único que identifica al producto: no se repite (ni con inactivos). */
async function assertCodeAvailable(products: ProductRepository, code: string, exceptId?: string) {
  const owner = await products.findByCode(code);
  if (owner && owner.id !== exceptId) {
    throw new ConflictError(`El código ${code} ya lo tiene ${owner.name}`, 'PRODUCT_CODE_TAKEN', {
      code,
      productId: owner.id,
    });
  }
}

/** Primer código libre en el orden de la cuadrícula de la máquina (ver ProductCode). */
async function nextFreeCode(products: ProductRepository): Promise<string> {
  const free = ProductCode.firstFree(await products.findTakenCodes());
  if (!free) {
    throw new ConflictError('Ya están ocupados todos los códigos, del 10 al 99', 'NO_PRODUCT_CODE_AVAILABLE');
  }
  return free.value;
}

export interface CreateProductInput {
  name: string;
  /** Código de 2 dígitos del teclado (10 a 99). Si no se envía, se asigna el primero libre. */
  code?: string | null;
  description?: string | null;
  unit?: string;
  minStock?: number;
  categoryId?: string | null;
  /** Precio de referencia (decimal): valora lo que se saca si el producto nunca se ha comprado. */
  referencePrice?: string | number | null;
  /** Stock inicial opcional: se registra como una entrada a nombre del admin. */
  initialQuantity?: number;
}

const toPrice = (value: string | number | null | undefined): Money | null =>
  value === null || value === undefined || value === '' ? null : Money.fromDecimal(value);

export class CreateProductUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly categories: CategoryRepository,
    private readonly recorder: StockMovementRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateProductInput, actor: Actor): Promise<ProductDto> {
    requireAdmin(actor);
    await assertCategoryExists(this.categories, input.categoryId);
    const initial = input.initialQuantity ? Quantity.create(input.initialQuantity) : null;
    const now = this.clock.now();
    const product = Product.create({
      ...input,
      referencePrice: toPrice(input.referencePrice),
      id: this.ids.generate(),
      now,
    });

    return this.uow.run(async (repos) => {
      if (await repos.products.findByName(product.name)) throw nameTaken(product.name);
      if (product.code) await assertCodeAvailable(repos.products, product.code);
      else product.assignCode(await nextFreeCode(repos.products), now);
      await repos.products.save(product);
      if (!initial) return toProductDto(product);

      const { product: stocked } = await this.recorder.record(repos, {
        productId: product.id,
        type: MovementType.IN,
        quantity: initial,
        performedBy: actor.id,
        registeredBy: actor.id,
        note: 'Stock inicial',
        now,
      });
      return toProductDto(stocked);
    });
  }
}

export interface UpdateProductInput {
  name?: string;
  /** Cambiar el código del teclado (no se puede quitar: todo producto tiene uno). */
  code?: string;
  description?: string | null;
  unit?: string;
  minStock?: number;
  categoryId?: string | null;
  referencePrice?: string | number | null;
  isActive?: boolean;
}

/** Edita datos del producto. El stock no se edita aquí: solo cambia con movimientos. */
export class UpdateProductUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly clock: Clock,
  ) {}

  async execute(productId: string, input: UpdateProductInput, actor: Actor): Promise<ProductDto> {
    requireAdmin(actor);
    const product = await getProductOrFail(this.products, productId);
    const now = this.clock.now();

    if (input.categoryId !== undefined) await assertCategoryExists(this.categories, input.categoryId);

    product.updateDetails(
      {
        name: input.name ?? product.name,
        code: input.code ?? product.code,
        description: input.description !== undefined ? input.description : product.description,
        unit: input.unit ?? product.unit,
        minStock: input.minStock ?? product.minStock,
        categoryId: input.categoryId !== undefined ? input.categoryId : product.categoryId,
        referencePrice:
          input.referencePrice !== undefined ? toPrice(input.referencePrice) : product.referencePrice,
      },
      now,
    );

    const owner = await this.products.findByName(product.name);
    if (owner && owner.id !== product.id) throw nameTaken(product.name);
    if (input.code !== undefined && product.code) {
      await assertCodeAvailable(this.products, product.code, product.id);
    }

    if (input.isActive === true) product.activate(now);
    if (input.isActive === false) product.deactivate(now);

    await this.products.save(product);
    return toProductDto(product);
  }
}

/** Lista de productos con su precio actual (última compra, o el de referencia). */
export class ListProductsUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly purchases: PurchaseRepository,
    private readonly clock: Clock,
  ) {}

  async execute(filter: ProductFilter = {}): Promise<ProductDto[]> {
    const products = await this.products.findAll(filter);
    const prices = await this.purchases.findLatestUnitPrices(
      products.map((p) => p.id),
      this.clock.now(),
    );
    return products.map((p) => toProductDto(p, prices.get(p.id) ?? null));
  }
}

export interface ProductDetailDto {
  product: ProductDto;
  latestMovements: MovementView[];
}

const LATEST_MOVEMENTS = 10;

export class GetProductUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly movements: MovementRepository,
  ) {}

  async execute(productId: string): Promise<ProductDetailDto> {
    const product = await getProductOrFail(this.products, productId);
    const page = await this.movements.findPage({ productId }, { page: 1, pageSize: LATEST_MOVEMENTS });
    return { product: toProductDto(product), latestMovements: page.items };
  }
}
