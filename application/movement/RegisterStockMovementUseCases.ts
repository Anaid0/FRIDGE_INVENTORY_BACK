import { MovementActorPolicy, MovementType, Quantity, type Actor } from '../../domain';
import { toMovementDto, toProductDto, type MovementDto, type ProductDto } from '../dto';
import type { Clock, UnitOfWork } from '../ports';
import { getActiveUserOrFail } from '../shared/loaders';
import type { StockMovementRecorder } from './StockMovementRecorder';

export interface RegisterStockMovementInput {
  productId: string;
  quantity: number;
  note?: string | null;
  /** Solo lo tiene en cuenta si el actor es ADMIN; para los demás se ignora. */
  performedBy?: string | null;
}

export interface RegisterStockMovementResult {
  movement: MovementDto;
  product: ProductDto;
}

/** Flujo común de entrada y salida manual; cada subclase fija el tipo (OCP). */
abstract class RegisterStockMovementUseCase {
  protected abstract readonly type: MovementType;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly recorder: StockMovementRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterStockMovementInput, actor: Actor): Promise<RegisterStockMovementResult> {
    const quantity = Quantity.create(input.quantity);
    const performedBy = MovementActorPolicy.resolvePerformedBy(actor, input.performedBy);

    return this.uow.run(async (repos) => {
      await getActiveUserOrFail(repos.users, performedBy);
      const { movement, product } = await this.recorder.record(repos, {
        productId: input.productId,
        type: this.type,
        quantity,
        performedBy,
        registeredBy: actor.id,
        note: input.note,
        now: this.clock.now(),
      });
      return { movement: toMovementDto(movement), product: toProductDto(product) };
    });
  }
}

/** Meter productos a la nevera. */
export class RegisterStockInUseCase extends RegisterStockMovementUseCase {
  protected readonly type = MovementType.IN;
}

/** Sacar productos de la nevera (cuenta para el ranking). */
export class RegisterStockOutUseCase extends RegisterStockMovementUseCase {
  protected readonly type = MovementType.OUT;
}
