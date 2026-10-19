import { Category, ConflictError, type Actor, type CategoryRepository } from '../../domain';
import { toCategoryDto, type CategoryDto } from '../dto';
import type { Clock, IdGenerator } from '../ports';
import { requireAdmin } from '../shared/authorization';

export class CreateCategoryUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: { name: string }, actor: Actor): Promise<CategoryDto> {
    requireAdmin(actor);
    const category = Category.create({ id: this.ids.generate(), name: input.name, now: this.clock.now() });
    if (await this.categories.findByName(category.name)) {
      throw new ConflictError('Ya existe una categoría con ese nombre', 'CATEGORY_NAME_TAKEN', {
        name: category.name,
      });
    }
    await this.categories.save(category);
    return toCategoryDto(category);
  }
}

export class ListCategoriesUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(): Promise<CategoryDto[]> {
    return (await this.categories.findAll()).map(toCategoryDto);
  }
}
