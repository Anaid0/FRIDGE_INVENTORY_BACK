import { ValidationError } from '../../domain';
import type { FileToStore } from '../ports';

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

/** Comprobante de compra: foto (jpg/png) o PDF de hasta 5 MB. */
export function assertValidReceipt(file: FileToStore): void {
  if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(file.mimeType)) {
    throw new ValidationError('El comprobante debe ser JPG, PNG o PDF', 'INVALID_RECEIPT_TYPE', {
      mimeType: file.mimeType,
    });
  }
  if (file.content.byteLength === 0 || file.content.byteLength > RECEIPT_MAX_BYTES) {
    throw new ValidationError('El comprobante debe pesar entre 1 byte y 5 MB', 'INVALID_RECEIPT_SIZE', {
      bytes: file.content.byteLength,
    });
  }
}
