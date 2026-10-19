import {
  ConflictError,
  MovementType,
  NotFoundError,
  Product,
  Quantity,
  type Actor,
  type CategoryRepository,
  type MovementRepository,
  type MovementView,
  type ProductFilter,
  type ProductRepository,
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

export interface CreateProductInput {
  name: string;
  description?: string | null;
  unit?: string;
  minStock?: number;
  categoryId?: string | null;
  /** Stock inicial opcional: se registra como una entrada a nombre del admin. */
  initialQuantity?: number;
}

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
    const product = Product.create({ ...input, id: this.ids.generate(), now });

    return this.uow.run(async (repos) => {
      if (await repos.products.findByName(product.name)) throw nameTaken(product.name);
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
  description?: string | null;
  unit?: string;
  minStock?: number;
  categoryId?: string | null;
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
        description: input.description !== undefined ? input.description : product.description,
        unit: input.unit ?? product.unit,
        minStock: input.minStock ?? product.minStock,
        categoryId: input.categoryId !== undefined ? input.categoryId : product.categoryId,
      },
      now,
    );

    const owner = await this.products.findByName(product.name);
    if (owner && owner.id !== product.id) throw nameTaken(product.name);

    if (input.isActive === true) product.activate(now);
    if (input.isActive === false) product.deactivate(now);

    await this.products.save(product);
    return toProductDto(product);
  }
}

export class ListProductsUseCase {
  constructor(private readonly products: ProductRepository) {}

  async execute(filter: ProductFilter = {}): Promise<ProductDto[]> {
    return (await this.products.findAll(filter)).map(toProductDto);
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
