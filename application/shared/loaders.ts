import {
  NotFoundError,
  ValidationError,
  type FundingPeriodRepository,
  type ProductRepository,
  type UserRepository,
} from '../../domain';

/** Búsquedas que lanzan NotFound con un código estable, para no repetirlas en cada caso de uso. */
export async function getUserOrFail(users: UserRepository, id: string) {
  const user = await users.findById(id);
  if (!user) throw new NotFoundError('Usuario no encontrado', 'USER_NOT_FOUND', { id });
  return user;
}

export async function getActiveUserOrFail(users: UserRepository, id: string) {
  const user = await getUserOrFail(users, id);
  if (!user.isActive) throw new ValidationError('El usuario está desactivado', 'USER_INACTIVE', { id });
  return user;
}

export async function getProductOrFail(products: ProductRepository, id: string) {
  const product = await products.findById(id);
  if (!product) throw new NotFoundError('Producto no encontrado', 'PRODUCT_NOT_FOUND', { id });
  return product;
}

export async function getPeriodOrFail(periods: FundingPeriodRepository, id: string) {
  const period = await periods.findById(id);
  if (!period) throw new NotFoundError('Quincena no encontrada', 'PERIOD_NOT_FOUND', { id });
  return period;
}
