import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../../application';

export class UuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
