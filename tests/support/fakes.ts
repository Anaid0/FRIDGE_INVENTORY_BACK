import {
  KIOSK_TOKEN_ROLE,
  type Clock,
  type FileStorage,
  type FileToStore,
  type IdGenerator,
  type PasswordHasher,
  type StoredFileContent,
  type TokenPayload,
  type TokenService,
  type TransactionalRepositories,
  type UnitOfWork,
} from '../../application';
import { isRole, NotFoundError, UnauthorizedError } from '../../domain';
import type { InMemoryDatabase } from './InMemoryDatabase';

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  set(date: Date): void {
    this.current = date;
  }
  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 24 * 60 * 60 * 1000);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private next = 1;
  generate(): string {
    return `id-${this.next++}`;
  }
}

export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string) {
    return `hashed:${plain}`;
  }
  async verify(plain: string, hash: string) {
    return hash === `hashed:${plain}`;
  }
}

export class FakeTokenService implements TokenService {
  sign(payload: TokenPayload): string {
    return `token:${payload.sub}:${payload.role}`;
  }
  verify(token: string): TokenPayload {
    const [prefix, sub, role] = token.split(':');
    if (prefix !== 'token' || !sub || !(isRole(role) || role === KIOSK_TOKEN_ROLE))
      throw new UnauthorizedError('Token inválido', 'INVALID_TOKEN');
    return { sub, role };
  }
}

export class InMemoryFileStorage implements FileStorage {
  readonly files = new Map<string, StoredFileContent>();
  private counter = 0;

  async save(folder: string, file: FileToStore): Promise<string> {
    const extension = file.originalName.split('.').pop();
    const path = `${folder}/file-${++this.counter}.${extension}`;
    this.files.set(path, { content: file.content, mimeType: file.mimeType });
    return path;
  }
  async read(path: string): Promise<StoredFileContent> {
    const file = this.files.get(path);
    if (!file) throw new NotFoundError('Archivo no encontrado', 'FILE_NOT_FOUND', { path });
    return file;
  }
  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }
}

/** Transacción simulada: si `work` falla, restaura la foto de la BD tomada al inicio. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(
    private readonly db: InMemoryDatabase,
    private readonly repos: TransactionalRepositories,
  ) {}

  async run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    const snapshot = this.db.snapshot();
    try {
      return await work(this.repos);
    } catch (error) {
      this.db.restore(snapshot);
      throw error;
    }
  }
}
