import multer from 'multer';
import { RECEIPT_MAX_BYTES } from '../../../application';

/** Comprobantes en memoria (máx. 5 MB): el caso de uso valida el tipo y los guarda con FileStorage. */
export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECEIPT_MAX_BYTES, files: 1 },
}).single('receipt');
