import {
  ConflictError,
  Pin,
  Role,
  User,
  ValidationError,
  type Actor,
  type UserRepository,
} from '../../domain';
import { toPersonDto, type PersonDto } from '../dto';
import type { Clock, IdGenerator, PasswordHasher } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { getUserOrFail } from '../shared/loaders';
import type { PinVerifier } from './PinVerifier';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

/** En la tablet cada persona se elige por su nombre: dos personas activas no pueden llamarse igual. */
async function assertUniqueName(users: UserRepository, name: string, lastname: string, exceptId?: string) {
  const wanted = normalize(`${name} ${lastname}`);
  const people = await users.findAll({ role: Role.EMPLOYEE, isActive: true });
  if (people.some((p) => p.id !== exceptId && normalize(p.fullName) === wanted)) {
    throw new ConflictError(
      'Ya hay una persona activa con ese nombre; agrega una inicial para distinguirla',
      'PERSON_NAME_TAKEN',
    );
  }
}

async function getPersonOrFail(users: UserRepository, id: string): Promise<User> {
  const user = await getUserOrFail(users, id);
  if (!user.isPerson()) {
    throw new ValidationError('Ese usuario es un administrador, no una persona', 'NOT_A_PERSON', { id });
  }
  return user;
}

export interface RegisterPersonInput {
  name: string;
  lastname: string;
  pin: string;
}

/** Alta de una persona para la tablet: solo nombre, apellido y PIN de 4 dígitos (sin email ni contraseña). */
export class RegisterPersonUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterPersonInput, actor: Actor): Promise<PersonDto> {
    requireAdmin(actor);
    const pin = Pin.create(input.pin);
    const now = this.clock.now();
    const person = User.createPerson({
      id: this.ids.generate(),
      name: input.name,
      lastname: input.lastname,
      pinHash: await this.hasher.hash(pin.value),
      now,
    });
    await assertUniqueName(this.users, person.name, person.lastname);
    await this.users.save(person);
    return toPersonDto(person, now);
  }
}

export interface UpdatePersonInput {
  name?: string;
  lastname?: string;
}

export class UpdatePersonUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(personId: string, input: UpdatePersonInput, actor: Actor): Promise<PersonDto> {
    requireAdmin(actor);
    const person = await getPersonOrFail(this.users, personId);
    const now = this.clock.now();
    person.rename(input.name ?? person.name, input.lastname ?? person.lastname, now);
    await assertUniqueName(this.users, person.name, person.lastname, person.id);
    await this.users.save(person);
    return toPersonDto(person, now);
  }
}

/** El admin asigna o restablece el PIN (también desbloquea a la persona). */
export class ResetPersonPinUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(personId: string, input: { pin: string }, actor: Actor): Promise<PersonDto> {
    requireAdmin(actor);
    const person = await getPersonOrFail(this.users, personId);
    const pin = Pin.create(input.pin);
    const now = this.clock.now();
    person.changePin(await this.hasher.hash(pin.value), now);
    await this.users.save(person);
    return toPersonDto(person, now);
  }
}

export class ListPeopleUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(filter: { isActive?: boolean; search?: string }, actor: Actor): Promise<PersonDto[]> {
    requireAdmin(actor);
    const now = this.clock.now();
    return (await this.users.findAll({ ...filter, role: Role.EMPLOYEE })).map((p) => toPersonDto(p, now));
  }
}

export interface ChangeOwnPinInput {
  personId: string;
  currentPin: string;
  newPin: string;
}

/** Desde la tablet: la persona cambia su propio PIN confirmando el actual. */
export class ChangeOwnPinUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly verifier: PinVerifier,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: ChangeOwnPinInput): Promise<void> {
    const newPin = Pin.create(input.newPin);
    const person = await this.verifier.verify(this.users, input.personId, input.currentPin);
    if (newPin.value === input.currentPin) {
      throw new ValidationError('El PIN nuevo debe ser distinto del actual', 'SAME_PIN');
    }
    person.changePin(await this.hasher.hash(newPin.value), this.clock.now());
    await this.users.save(person);
  }
}
