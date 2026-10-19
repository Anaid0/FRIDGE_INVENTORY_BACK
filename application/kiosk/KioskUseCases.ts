import type { MovementType } from '../../domain';
import {
  KioskDevice,
  NotFoundError,
  Quantity,
  Role,
  UnauthorizedError,
  ValidationError,
  type Actor,
  type KioskDeviceRepository,
  type UserRef,
  type UserRepository,
} from '../../domain';
import {
  toKioskDeviceDto,
  toKioskPersonDto,
  toMovementDto,
  toProductDto,
  toUserRef,
  type KioskDeviceDto,
  type KioskPersonDto,
  type MovementDto,
  type ProductDto,
} from '../dto';
import type { StockMovementRecorder } from '../movement/StockMovementRecorder';
import type { PinVerifier } from '../person/PinVerifier';
import { KIOSK_TOKEN_ROLE, type Clock, type IdGenerator, type TokenService, type UnitOfWork } from '../ports';
import { requireAdmin } from '../shared/authorization';

/** Duración del token de una tablet: larga, porque se puede revocar en cualquier momento. */
export const KIOSK_TOKEN_TTL = '1825d'; // ~5 años
const MAX_ITEMS = 20;

async function getDeviceOrFail(devices: KioskDeviceRepository, id: string): Promise<KioskDevice> {
  const device = await devices.findById(id);
  if (!device) throw new NotFoundError('Tablet no encontrada', 'DEVICE_NOT_FOUND', { id });
  return device;
}

async function creatorRef(users: UserRepository, id: string): Promise<UserRef | null> {
  const user = await users.findById(id);
  return user ? toUserRef(user) : null;
}

export interface PairKioskResult {
  device: KioskDeviceDto;
  /** Se muestra una sola vez: la tablet lo guarda y lo envía en cada petición. */
  token: string;
}

/** El admin autoriza una tablet y obtiene su token. */
export class PairKioskDeviceUseCase {
  constructor(
    private readonly devices: KioskDeviceRepository,
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: { name: string }, actor: Actor): Promise<PairKioskResult> {
    requireAdmin(actor);
    const device = KioskDevice.pair({
      id: this.ids.generate(),
      name: input.name,
      createdBy: actor.id,
      now: this.clock.now(),
    });
    await this.devices.save(device);
    const token = this.tokens.sign(
      { sub: device.id, role: KIOSK_TOKEN_ROLE },
      { expiresIn: KIOSK_TOKEN_TTL },
    );
    return { device: toKioskDeviceDto(device, await creatorRef(this.users, actor.id)), token };
  }
}

export class ListKioskDevicesUseCase {
  constructor(
    private readonly devices: KioskDeviceRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(actor: Actor): Promise<KioskDeviceDto[]> {
    requireAdmin(actor);
    const devices = await this.devices.findAll();
    return Promise.all(
      devices.map(async (d) => toKioskDeviceDto(d, await creatorRef(this.users, d.createdBy))),
    );
  }
}

/** Deja a una tablet sin acceso de inmediato (su token deja de servir). */
export class RevokeKioskDeviceUseCase {
  constructor(
    private readonly devices: KioskDeviceRepository,
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(deviceId: string, actor: Actor): Promise<KioskDeviceDto> {
    requireAdmin(actor);
    const device = await getDeviceOrFail(this.devices, deviceId);
    device.revoke(actor.id, this.clock.now());
    await this.devices.save(device);
    return toKioskDeviceDto(device, await creatorRef(this.users, device.createdBy));
  }
}

/**
 * Valida la tablet de una petición con token KIOSK: debe existir y no estar revocada.
 * Registra la última conexión (como mucho una vez por minuto).
 */
export class AuthenticateKioskDeviceUseCase {
  constructor(
    private readonly devices: KioskDeviceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(deviceId: string): Promise<KioskDeviceDto> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new UnauthorizedError('Esta tablet no está autorizada', 'DEVICE_NOT_AUTHORIZED');
    if (!device.isActive()) {
      throw new UnauthorizedError(
        'Esta tablet fue desautorizada; pide al administrador que la vuelva a autorizar',
        'DEVICE_REVOKED',
      );
    }
    if (device.markSeen(this.clock.now())) await this.devices.save(device);
    return toKioskDeviceDto(device);
  }
}

/** Personas que aparecen en la tablet: activas y con PIN asignado. */
export class ListKioskPeopleUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(): Promise<KioskPersonDto[]> {
    const people = await this.users.findAll({ role: Role.EMPLOYEE, isActive: true });
    return people.filter((p) => p.hasPin()).map(toKioskPersonDto);
  }
}

export interface KioskMovementInput {
  personId: string;
  pin: string;
  type: MovementType;
  items: { productId: string; quantity: number }[];
  note?: string | null;
}

export interface KioskMovementResult {
  person: UserRef;
  type: MovementType;
  movements: MovementDto[];
  products: ProductDto[];
}

/**
 * Registro desde la tablet: la persona se identifica con su PIN y saca (o mete) uno o varios productos.
 * 1. Se valida la lista y el PIN (fuera de la transacción: los intentos fallidos deben quedar guardados).
 * 2. Todas las líneas se registran en UNA transacción: si una falla (p. ej. sin stock), no se guarda ninguna.
 * Quien lo realiza y quien lo registra es la misma persona.
 */
export class KioskRegisterMovementsUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UserRepository,
    private readonly verifier: PinVerifier,
    private readonly recorder: StockMovementRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(input: KioskMovementInput): Promise<KioskMovementResult> {
    const items = this.validateItems(input.items);
    const person = await this.verifier.verify(this.users, input.personId, input.pin);

    return this.uow.run(async (repos) => {
      const now = this.clock.now();
      const recorded = [];
      for (const item of items) {
        recorded.push(
          await this.recorder.record(repos, {
            productId: item.productId,
            type: input.type,
            quantity: item.quantity,
            performedBy: person.id,
            registeredBy: person.id,
            note: input.note,
            now,
          }),
        );
      }
      return {
        person: toUserRef(person),
        type: input.type,
        movements: recorded.map((r) => toMovementDto(r.movement)),
        products: recorded.map((r) => toProductDto(r.product)),
      };
    });
  }

  private validateItems(items: KioskMovementInput['items']) {
    if (!items.length) throw new ValidationError('Elige al menos un producto', 'EMPTY_MOVEMENT');
    if (items.length > MAX_ITEMS) {
      throw new ValidationError(`Máximo ${MAX_ITEMS} productos por registro`, 'TOO_MANY_ITEMS');
    }
    const seen = new Set<string>();
    return items.map((item) => {
      if (seen.has(item.productId)) {
        throw new ValidationError('Un producto aparece dos veces; suma las cantidades', 'DUPLICATE_PRODUCT', {
          productId: item.productId,
        });
      }
      seen.add(item.productId);
      return { productId: item.productId, quantity: Quantity.create(item.quantity) };
    });
  }
}
